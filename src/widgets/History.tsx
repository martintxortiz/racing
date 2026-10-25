"use client";
import { useMemo } from "react";
import { fmtLap, fmtSigned } from "@/data/format";
import type { Lap } from "@/derive/model";
import { computeBests } from "@/derive/timing";
import { sep, type MenuItem } from "@/menus/types";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip, Pill } from "./cells";
import { useT, useTiming } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./history.module.css";

export interface HistoryConfig {
  value?: "time" | "delta" | "session";
}

const MODE_LABEL = { time: "Lap time", delta: "Gap to own best", session: "Gap to session best" } as const;

function LapHistory({ session, config, setConfig }: WidgetProps<HistoryConfig>) {
  const t = useT(2);
  const panel = usePanel();
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const focusLap = useApp((s) => s.focusLap);
  const compareLap = useApp((s) => s.compareLap);
  const timing = useTiming(session, t);
  const mode = config.value ?? "time";
  const tk = Math.floor(t);
  const bests = useMemo(() => computeBests(session.laps, tk, null), [session, tk]);
  const maxLap = useMemo(() => {
    let m = 0;
    for (const l of session.laps) if ((l.t1 ?? Infinity) <= tk || l.t0 <= tk) m = Math.max(m, l.n);
    return m;
  }, [session, tk]);
  const cols = useMemo(() => Array.from({ length: maxLap }, (_, i) => i + 1), [maxLap]);

  const cell = (l: Lap | undefined) => {
    if (!l || l.t0 > tk) return { text: "", cls: "" };
    const done = l.t1 != null && l.t1 <= tk;
    if (!done) return { text: "…", cls: css.pit };
    if (l.time == null) return { text: l.pitIn ? "In" : l.pitOut ? "Out" : "", cls: css.pit };
    const pe = bests.byEntity.get(l.entity);
    let cls = "";
    if (l.deleted) cls = css.del;
    else if (l.valid && bests.lap != null && l.time <= bests.lap + 1e-9) cls = css.sb;
    else if (l.valid && pe?.lap != null && l.time <= pe.lap + 1e-9) cls = css.pb;
    else if (!l.valid) cls = css.pit;
    let text: React.ReactNode = fmtLap(l.time);
    if (mode === "delta" && pe?.lap != null && l.valid && cls !== css.pb && cls !== css.sb) text = fmtSigned(l.time - pe.lap, 3);
    if (mode === "session" && bests.lap != null && l.valid && cls !== css.sb) text = fmtSigned(l.time - bests.lap, 3);
    if (l.pitIn || l.pitOut) text = <><span className={css.tag}>{l.pitIn ? "in" : "out"}</span>{text}</>;
    // Session and personal bests are pills inside the cell, like every other highlighted value.
    if (cls === css.sb || cls === css.pb) return { text: <Pill tone={cls === css.sb ? "sb" : "pb"}>{text}</Pill>, cls: "" };
    return { text: <Pill>{text}</Pill>, cls };
  };

  const modeMenu = (): MenuItem[] => (Object.keys(MODE_LABEL) as (keyof typeof MODE_LABEL)[]).map((k) => ({ id: k, label: MODE_LABEL[k], checked: mode === k, run: () => setConfig({ value: k }) }));
  const bodyMenu = (e: React.MouseEvent) => openMenu(e, [{ kind: "label", label: "Show" }, ...modeMenu(), sep, { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Lap history");

  return (
    <div className={css.wrap} onContextMenu={bodyMenu}>
      <HeaderSlot>
        <span>{MODE_LABEL[mode]}</span>
      </HeaderSlot>
      <table className={`${css.grid} num`} data-testid="history-grid">
        <thead>
          <tr>
            <th className={css.stick} />
            {cols.map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timing.rows.map((r) => {
            const laps = session.lapsByEntity.get(r.entity.id) ?? [];
            const byN = new Map(laps.map((l) => [l.n, l]));
            return (
              <tr key={r.entity.id}>
                <td className={css.stick} onClick={(e) => selectEntity(r.entity.id, e)} onContextMenu={(e) => openEntityMenu(e, r.entity.id)}>
                  <DriverChip entity={r.entity} />
                </td>
                {cols.map((n) => {
                  const l = byN.get(n);
                  const c = cell(l);
                  const isA = r.entity.id === focus && focusLap === n;
                  const isB = r.entity.id === compare && compareLap === n;
                  return (
                    <td
                      key={n}
                      className={`${c.cls} ${isA ? css.selA : isB ? css.selB : ""}`}
                      title={l?.time != null ? `${r.entity.code} lap ${n}: ${fmtLap(l.time)}${l.deleted ? " (deleted)" : ""}` : undefined}
                      onClick={(e) => {
                        if (!l || l.time == null) return;
                        const st = useApp.getState();
                        if (e.shiftKey || e.metaKey || e.ctrlKey) st.setCompare(r.entity.id, n);
                        else st.setFocus(r.entity.id, n);
                      }}
                      onContextMenu={(e) => {
                        if (!l) return;
                        openEntityMenu(e, r.entity.id, [
                          { id: "fl", label: `Focus lap ${n}`, disabled: l.time == null, run: () => useApp.getState().setFocus(r.entity.id, n) },
                          { id: "cl", label: `Compare lap ${n}`, disabled: l.time == null, run: () => useApp.getState().setCompare(r.entity.id, n) },
                          { id: "jump", label: `Jump to the start of lap ${n}`, run: () => useCursor.getState().setT(l.t0) },
                          sep,
                          { kind: "sub", id: "show", label: "Show", items: modeMenu() },
                        ]);
                      }}
                    >
                      {c.text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const historyWidget: WidgetDef<HistoryConfig> = {
  type: "history",
  name: "Lap history",
  description: "Every driver's laps in a grid, marked session best and personal best",
  group: "Timing",
  unavailable: (s) => (s.laps.length ? null : "This file has no lap timing."),
  Component: LapHistory,
  menu: ({ config, setConfig }) => (Object.keys(MODE_LABEL) as (keyof typeof MODE_LABEL)[]).map((k) => ({ id: k, label: MODE_LABEL[k], checked: (config.value ?? "time") === k, run: () => setConfig({ value: k }) })),
};

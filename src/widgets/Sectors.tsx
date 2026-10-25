"use client";
import { useMemo } from "react";
import { DASH, fmtGap, fmtLap, fmtSector } from "@/data/format";
import { activeSegment, sectorTable } from "@/derive/timing";
import { sep, type MenuItem } from "@/menus/types";
import { useApp } from "@/state/app";
import { openMenu } from "@/state/menu";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip, Pill } from "./cells";
import { useT } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./table.module.css";

export interface SectorsConfig {
  scope?: "segment" | "session";
}

function Sectors({ session, config, setConfig, width }: WidgetProps<SectorsConfig>) {
  const t = useT(2);
  const tk = Math.floor(t);
  const panel = usePanel();
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const quali = session.kind === "qualifying" && session.segments.length > 1;
  const scope = quali ? config.scope ?? "segment" : "session";
  const seg = activeSegment(session, tk);
  const data = useMemo(() => sectorTable(session, tk, scope === "segment" ? seg : null), [session, tk, scope, seg]);
  const sb = data.bests.sectors;
  // Column budget in px (cells carry 16px padding); leave room for a vertical scrollbar.
  const base = 16 + 32 + 80 + 3 * 60 + 2 * 78 + 16;
  const avail = width - 16;
  const showLost = avail >= base + 64;
  const showTo = avail >= base + 64 + 72;
  const hidden = (showLost ? 0 : 1) + (showTo ? 0 : 1);
  const scopeMenu = (): MenuItem[] =>
    quali
      ? [
          { id: "seg", label: "Current phase", checked: scope === "segment", run: () => setConfig({ scope: "segment" }) },
          { id: "all", label: "Whole session", checked: scope === "session", run: () => setConfig({ scope: "session" }) },
        ]
      : [];

  return (
    <div className={css.scroll} onContextMenu={(e) => openMenu(e, [...scopeMenu(), sep, { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Sectors")}>
      <HeaderSlot>
        <span>
          {scope === "segment" ? session.segments[seg]?.label : "Whole session"}
          {data.idealBest != null && (
            <>
              {" "}· ideal <span className="num" style={{ color: "var(--text)" }}>{fmtLap(data.idealBest)}</span> {data.rows[0]?.entity.code}
            </>
          )}
        </span>
        {hidden > 0 && <span title={`${hidden === 1 ? "Gap to the best ideal lap is" : "Time lost and gap to the best ideal lap are"} hidden to fit; widen the panel to show ${hidden === 1 ? "it" : "them"}`}>{hidden} hidden</span>}
      </HeaderSlot>
      <table className={`${css.table} num`}>
        <thead>
          <tr>
            <th className={css.sel} />
            <th title="Rank by ideal lap">#</th>
            <th className={css.l}>Driver</th>
            <th title="Best sector 1">S1</th>
            <th title="Best sector 2">S2</th>
            <th title="Best sector 3">S3</th>
            <th title="Sum of best sectors">Ideal</th>
            <th title="Best actual lap">Best</th>
            {showLost && <th title="Best lap minus ideal lap">Lost</th>}
            {showTo && <th title="Ideal lap minus the best ideal lap">To ideal</th>}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => {
            const sel = r.entity.id === focus ? "a" : r.entity.id === compare ? "b" : undefined;
            return (
              <tr key={r.entity.id} data-sel={sel} onClick={(e) => selectEntity(r.entity.id, e)} onContextMenu={(e) => openEntityMenu(e, r.entity.id, scopeMenu().length ? [{ kind: "sub", id: "scope", label: "Bests over", items: scopeMenu() }] : [])}>
                <td className={`${css.sel} ${sel === "a" ? css.selA : css.selB}`}>{sel ? sel.toUpperCase() : ""}</td>
                <td>
                  <Pill>{i + 1}</Pill>
                </td>
                <td className={`${css.l} ${css.driver}`}>
                  <DriverChip entity={r.entity} />
                </td>
                {r.sectors.map((s, k) => (
                  <td key={k}>
                    <Pill tone={s != null && sb[k] != null && s <= sb[k]! + 1e-9 ? "sb" : "none"} muted={s == null}>
                      {fmtSector(s)}
                    </Pill>
                  </td>
                ))}
                <td style={{ fontWeight: 500 }}>
                  <Pill>{fmtLap(r.ideal)}</Pill>
                </td>
                <td>
                  <Pill tone={r.best != null && data.bests.lap != null && r.best <= data.bests.lap + 1e-9 ? "sb" : "none"}>{fmtLap(r.best)}</Pill>
                </td>
                {showLost && (
                  <td>
                    <Pill muted>{r.loss != null ? fmtGap(r.loss) : DASH}</Pill>
                  </td>
                )}
                {showTo && (
                  <td>
                    <Pill muted>{i === 0 ? DASH : r.ideal != null && data.idealBest != null ? fmtGap(r.ideal - data.idealBest) : DASH}</Pill>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!data.rows.length && <div className={css.empty}>No timed laps yet</div>}
    </div>
  );
}

export const sectorsWidget: WidgetDef<SectorsConfig> = {
  type: "sectors",
  name: "Sectors and ideal lap",
  description: "Best sectors per driver, the ideal lap they add up to and the time left on the table",
  group: "Timing",
  unavailable: (s) => (s.laps.some((l) => l.s[0] != null) ? null : "This file has no sector times."),
  Component: Sectors,
};

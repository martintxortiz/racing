"use client";
import { useMemo } from "react";
import { useApp } from "@/state/app";
import { openMenu } from "@/state/menu";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { onColour, teamFill, TYRE } from "./colour";
import { useT, useTiming } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import tcss from "./table.module.css";
import css from "./stints.module.css";

const TYRE_TEXT: Record<string, string> = { SOFT: "#fff", MEDIUM: "#15171a", HARD: "#15171a", INTERMEDIATE: "#fff", WET: "#fff" };

function Stints({ session }: WidgetProps) {
  const t = useT(2);
  const panel = usePanel();
  const theme = useApp((s) => s.theme);
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const timing = useTiming(session, t);
  const total = session.totalLaps ?? Math.max(1, session.raceLaps);
  const byEntity = useMemo(() => {
    const m = new Map<string, typeof session.stints>();
    for (const s of session.stints) {
      const l = m.get(s.entity) ?? [];
      l.push(s);
      m.set(s.entity, l);
    }
    return m;
  }, [session]);
  const ticks = useMemo(() => {
    const step = total > 40 ? 10 : 5;
    const out: number[] = [];
    for (let n = step; n < total; n += step) out.push(n);
    return out;
  }, [total]);
  const used = [...new Set(session.stints.map((s) => s.compound))];
  const pct = (lap: number) => `${(Math.max(0, lap) / total) * 100}%`;

  return (
    <div className={css.wrap} onContextMenu={(e) => openMenu(e, [{ kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Stints")}>
      <HeaderSlot>
        <span className={css.legend}>
          {used.map((c) => (
            <span key={c}>
              <span className={css.dot} style={{ background: TYRE[c]?.css ?? "var(--text-3)" }} />
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </span>
          ))}
        </span>
      </HeaderSlot>
      <div className={css.axis}>
        <div className={css.who} />
        <div className={css.ticks}>
          {ticks.map((n) => (
            <span key={n} className={css.tick} style={{ left: pct(n) }}>
              {n}
            </span>
          ))}
        </div>
      </div>
      {timing.rows.map((r) => {
        const fill = teamFill(r.entity.colour, theme === "dark");
        const done = r.laps;
        const isSel = r.entity.id === focus || r.entity.id === compare;
        return (
          <div key={r.entity.id} className={css.row} onClick={(e) => selectEntity(r.entity.id, e)} onContextMenu={(e) => openEntityMenu(e, r.entity.id)} style={isSel ? { background: r.entity.id === focus ? "var(--a-tint)" : "var(--b-tint)" } : undefined}>
            <div className={css.who}>
              <div className={tcss.driverFill} style={{ background: fill, color: onColour(fill), minWidth: 44 }}>{r.entity.code}</div>
            </div>
            <div className={css.track}>
              {(byEntity.get(r.entity.id) ?? []).map((s) => {
                const end = Math.min(s.lapEnd, Math.max(done, s.lapStart));
                if (s.lapStart > done + 1) return null;
                const w = Math.max(1, end - s.lapStart + 1);
                return (
                  <div
                    key={s.n}
                    className={css.bar}
                    style={{ left: pct(s.lapStart - 1), width: `calc(${pct(w)} - 2px)`, background: TYRE[s.compound]?.css ?? "var(--text-3)", color: TYRE_TEXT[s.compound] ?? "#fff" }}
                    title={`${s.compound.toLowerCase()} laps ${s.lapStart}–${s.lapEnd}${s.ageAtStart ? `, ${s.ageAtStart} laps old at fitting` : ", new"}`}
                  >
                    {w >= 4 ? w : ""}
                  </div>
                );
              })}
              <div className={css.now} style={{ left: pct(done) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const stintsWidget: WidgetDef = {
  type: "stints",
  name: "Tyre stints",
  description: "Compound and length of every stint, up to the replay time",
  group: "Timing",
  unavailable: (s) => (s.stints.length ? null : "This file has no stints topic."),
  Component: Stints,
};

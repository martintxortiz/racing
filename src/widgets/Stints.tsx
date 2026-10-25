"use client";
import { useMemo } from "react";
import { useApp } from "@/state/app";
import { openMenu } from "@/state/menu";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip } from "./cells";
import { TYRE } from "./colour";
import { useT, useTiming } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./stints.module.css";

/** Dark text on the light compounds, white on the saturated ones. */
const DARK_TEXT = new Set(["MEDIUM", "HARD"]);
const WHO = 54;
const PAD_R = 10;

/** Pixel position of the start of lap `n` (1-based); lap boundaries fall on whole pixels. */
export function lapX(n: number, total: number, trackW: number): number {
  return Math.round(((n - 1) / total) * trackW);
}

function Stints({ session, width }: WidgetProps) {
  const t = useT(2);
  const panel = usePanel();
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const timing = useTiming(session, t);
  const total = session.totalLaps ?? Math.max(1, session.raceLaps);
  const trackW = Math.max(40, width - WHO - PAD_R);
  const byEntity = useMemo(() => {
    const m = new Map<string, typeof session.stints>();
    for (const s of session.stints) {
      const l = m.get(s.entity) ?? [];
      l.push(s);
      m.set(s.entity, l);
    }
    return m;
  }, [session]);
  const step = trackW / total < 6 ? 10 : 5;
  const ticks: number[] = [];
  for (let n = step; n < total; n += step) ticks.push(n);
  const used = [...new Set(session.stints.map((s) => s.compound))];
  const x = (lap: number) => lapX(lap, total, trackW);
  // End of the leader's last completed lap.
  const nowX = x(Math.min(total, timing.leaderLaps) + 1);

  return (
    <div className={css.wrap} onContextMenu={(e) => openMenu(e, [{ kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Tyre strategy")} data-testid="tyre-strategy">
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
      <div className={css.body} style={{ ["--who" as string]: `${WHO}px`, ["--track" as string]: `${trackW}px` }}>
        <div className={css.axis}>
          <div className={css.who}>Lap</div>
          <div className={css.ticks}>
            {ticks.map((n) => (
              // Tick label centred on the boundary after lap n.
              <span key={n} className={css.tick} style={{ left: x(n + 1) }}>
                {n}
              </span>
            ))}
          </div>
        </div>
        <div className={css.grid} aria-hidden>
          {ticks.map((n) => (
            <span key={n} className={css.gridline} style={{ left: x(n + 1) }} />
          ))}
          {timing.leaderLaps > 0 && <span className={css.now} style={{ left: nowX }} />}
        </div>
        {timing.rows.map((r) => {
          const done = r.laps;
          const sel = r.entity.id === focus ? "a" : r.entity.id === compare ? "b" : undefined;
          return (
            <div key={r.entity.id} className={css.row} data-sel={sel} onClick={(e) => selectEntity(r.entity.id, e)} onContextMenu={(e) => openEntityMenu(e, r.entity.id)}>
              <div className={css.who}>
                <DriverChip entity={r.entity} />
              </div>
              <div className={css.track}>
                {(byEntity.get(r.entity.id) ?? []).map((s) => {
                  // Completed laps only, so every bar ends on a lap boundary at or before the now line.
                  if (s.lapStart > done) return null;
                  const end = Math.min(s.lapEnd, done);
                  const x0 = x(s.lapStart);
                  const x1 = x(end + 1);
                  const w = Math.max(2, x1 - x0 - 1);
                  const laps = end - s.lapStart + 1;
                  return (
                    <div
                      key={s.n}
                      className={css.bar}
                      style={{ left: x0, width: w, background: TYRE[s.compound]?.css ?? "var(--text-3)", color: DARK_TEXT.has(s.compound) ? "#161616" : "#ffffff" }}
                      title={`${s.compound.charAt(0) + s.compound.slice(1).toLowerCase()}, laps ${s.lapStart}–${s.lapEnd}${s.ageAtStart ? `, ${s.ageAtStart} laps old when fitted` : ", new set"}`}
                    >
                      {w >= 26 ? `${TYRE[s.compound]?.short ?? s.compound[0]} ${laps}` : w >= 12 ? (TYRE[s.compound]?.short ?? "") : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const stintsWidget: WidgetDef = {
  type: "stints",
  name: "Tyre strategy",
  description: "Every car's stints as compound bars on a lap axis, up to the replay time",
  group: "Timing",
  unavailable: (s) => (s.stints.length ? null : "This file has no stints topic."),
  Component: Stints,
};

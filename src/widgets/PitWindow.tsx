"use client";
import { useMemo } from "react";
import { MINUS } from "@/data/format";
import type { SessionModel } from "@/derive/model";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { onColour, teamFill } from "./colour";
import { useT, useTiming } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./pitwindow.module.css";

export interface PitWindowConfig {
  /** Seconds lost by a stop; 0 or unset uses the session's median pit lane time. */
  loss?: number;
  /** Half-width of the axis in seconds. */
  span?: number;
}

/** Median pit lane time in the file, or null when no stops have a lane time. */
export function medianPitLoss(s: SessionModel): number | null {
  const v = s.pits.map((p) => p.lane).filter((x): x is number => x != null && x > 5 && x < 60).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor(v.length / 2)];
}

const CHIP_W = 36;
const LANE_H = 18;
/** Smallest spacing between labelled ticks. */
const TICK_PX = 36;

function PitWindow({ session, config, setConfig, width, height }: WidgetProps<PitWindowConfig>) {
  const t = useT(4);
  const timing = useTiming(session, t);
  const panel = usePanel();
  const dark = useApp((s) => s.theme === "dark");
  const focusSel = useApp((s) => s.focus);
  const median = useMemo(() => medianPitLoss(session), [session]);
  const loss = config.loss || median || 22;
  const span = config.span ?? 30;
  const running = timing.rows.filter((r) => r.state !== "retired");
  const me = running.find((r) => r.entity.id === focusSel) ?? running[0];
  const myGap = me ? (me.pos === 1 ? 0 : me.gap) : null;

  const PAD = 18;
  const x = (rel: number) => PAD + ((span - rel) / (2 * span)) * (width - 2 * PAD);
  const axisY = height - 24;

  // Positions relative to the focus car: positive is ahead of it.
  const cars = running
    .map((r) => ({ r, rel: myGap != null && (r.pos === 1 || r.gap != null) && !r.lapsDown ? myGap - (r.pos === 1 ? 0 : r.gap!) : null }))
    .filter((c): c is { r: (typeof running)[number]; rel: number } => c.rel != null && Math.abs(c.rel) <= span);
  cars.sort((a, b) => b.rel - a.rel);
  const lanes: number[] = [];
  const placed = cars.map((c) => {
    const px = x(c.rel);
    let lane = 0;
    while (lanes[lane] != null && px - lanes[lane] < CHIP_W + 2) lane++;
    lanes[lane] = px;
    return { ...c, px, lane };
  });
  // As many chip lanes as fit above the axis; cars beyond them stay as dots on the axis.
  const maxLanes = Math.max(1, Math.floor((axisY - 22) / LANE_H));
  const laneCount = Math.max(1, Math.min(maxLanes, lanes.length));
  // Chips sit in the middle of the space above the axis.
  const base = Math.round(Math.min(axisY - 2, Math.max(22 + laneCount * LANE_H, (22 + axisY + laneCount * LANE_H) / 2)));

  // Rejoin: the focus car after a stop, `loss` seconds further back.
  const rejoinGap = myGap != null ? myGap + loss : null;
  const rejoinPos = rejoinGap != null && me ? 1 + running.filter((r) => r !== me && !r.lapsDown && (r.pos === 1 ? 0 : (r.gap ?? Infinity)) < rejoinGap).length : null;
  const rx = x(-loss);
  const ticks: number[] = [];
  const step = span > 20 ? 5 : 2;
  for (let v = -span; v <= span; v += step) ticks.push(v);
  const pxPerStep = (step / (2 * span)) * (width - 2 * PAD);
  const labelEvery = [1, 2, 3, 4, 6].find((k) => k * pxPerStep >= TICK_PX) ?? 6;

  const menu = (e: React.MouseEvent) =>
    openMenu(
      e,
      [
        { kind: "label", label: "Pit loss" },
        { id: "auto", label: `Auto (${median != null ? `${median.toFixed(1)} s median lane time` : "22 s default"})`, checked: !config.loss, run: () => setConfig({ loss: 0 }) },
        ...[16, 18, 20, 22, 25, 28].map((v) => ({ id: `l${v}`, label: `${v} s`, checked: config.loss === v, run: () => setConfig({ loss: v }) })),
        { kind: "label", label: "Range" },
        ...[15, 30, 45].map((v) => ({ id: `s${v}`, label: `±${v} s`, checked: span === v, run: () => setConfig({ span: v }) })),
        { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
      ],
      "Pit window",
    );

  return (
    <div className={css.wrap} onContextMenu={menu} data-testid="pit-window">
      <HeaderSlot>
        <span className="num">
          {me ? `${me.entity.code} · ` : ""}pit loss {loss.toFixed(1)} s{config.loss ? "" : " (auto)"}
        </span>
      </HeaderSlot>
      {!me || myGap == null ? (
        <div className={css.empty}>{session.kind === "race" ? "No gaps yet" : "Pit window needs race gaps"}</div>
      ) : (
        <>
          <div className={css.band} style={{ left: Math.min(rx, x(-loss + 1.5)), width: Math.abs(x(-loss - 1.5) - x(-loss + 1.5)), top: 22, height: axisY - 22 }} />
          <div className={css.rejoin} style={{ left: rx, top: 22, height: axisY - 22 }} />
          <div className={css.rejoinLabel} style={{ left: rx + 6, top: 3 }}>
            Rejoins P{rejoinPos}
          </div>
          <div className={css.self} style={{ left: x(0), top: 22, height: axisY - 22 }} />
          {placed.map((c) => {
            const fill = teamFill(c.r.entity.colour, dark);
            const isMe = c.r === me;
            if (c.lane >= maxLanes)
              return (
                <div
                  key={c.r.entity.id}
                  className={css.dot}
                  style={{ left: c.px - 4, top: axisY - 4, background: "var(--text-3)" }}
                  title={`${c.r.entity.code}: ${c.rel >= 0 ? `${c.rel.toFixed(1)} s ahead` : `${(-c.rel).toFixed(1)} s behind`}`}
                  onClick={(e) => selectEntity(c.r.entity.id, e)}
                />
              );
            return (
              <div
                key={c.r.entity.id}
                className={css.chip}
                style={{ left: c.px - CHIP_W / 2, top: base - (c.lane + 1) * LANE_H, background: fill, color: onColour(fill), outline: isMe ? "1.5px solid var(--a)" : undefined }}
                title={`${c.r.entity.name}: ${c.rel >= 0 ? `${c.rel.toFixed(1)} s ahead` : `${(-c.rel).toFixed(1)} s behind`}`}
                onClick={(e) => selectEntity(c.r.entity.id, e)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  openEntityMenu(e, c.r.entity.id);
                }}
              >
                {c.r.entity.code}
              </div>
            );
          })}
          <svg className={css.axis} width={width} height={24} style={{ top: axisY }}>
            <line x1={PAD} x2={width - PAD} y1={1} y2={1} stroke="var(--line-2)" />
            {ticks.map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={1} y2={5} stroke="var(--line-2)" />
                {Math.round(v / step) % labelEvery === 0 && (
                  <text x={x(v)} y={18} textAnchor="middle" className={css.tick}>
                    {v > 0 ? `+${v}` : v < 0 ? `${MINUS}${-v}` : "0"}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  );
}

export const pitWindowWidget: WidgetDef<PitWindowConfig> = {
  type: "pitwindow",
  name: "Pit window",
  description: "Cars around the focus car by gap, with where it would rejoin after a stop",
  group: "Timing",
  unavailable: (s) => (s.kind === "race" ? null : "The pit window needs a race with gaps."),
  Component: PitWindow,
};

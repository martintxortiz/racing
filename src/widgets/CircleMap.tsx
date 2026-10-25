"use client";
import { useMemo } from "react";
import { fmtClock } from "@/data/format";
import type { Outline } from "@/derive/model";
import { poseAt } from "@/derive/trace";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { usePanel } from "@/ui/panelContext";
import { onColour, teamFill } from "./colour";
import { poseTopic, useT, useTiming, useTopics } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./circle.module.css";

/** Lap distance of the outline point nearest to (x, y). */
export function projectToOutline(o: Outline, x: number, y: number): number {
  let best = Infinity;
  let k = 0;
  for (let i = 0; i < o.x.length; i++) {
    const dx = o.x[i] - x;
    const dy = o.y[i] - y;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      k = i;
    }
  }
  return o.d[k];
}

const CHIP_W = 30;
const CHIP_H = 14;

/** Circle map: every car's lap distance as an angle on a ring, start line at the top, clockwise. */
function CircleMap({ session, width, height }: WidgetProps) {
  const t = useT(10);
  const timing = useTiming(session, t);
  const panel = usePanel();
  const dark = useApp((s) => s.theme === "dark");
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const o = session.outline;
  const poseTopics = useMemo(() => session.entities.map((e) => poseTopic(e.id)).filter((x): x is string => !!x), [session]);
  const { cols } = useTopics(poseTopics);

  const cx = width / 2;
  const cy = height / 2;
  const R = Math.max(30, Math.min(width, height) / 2 - 44);
  const ang = (d: number) => (o ? (d / o.length) * 2 * Math.PI - Math.PI / 2 : 0);
  const at = (a: number, r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;

  const cars: { id: string; a: number }[] = [];
  if (o) {
    for (const r of timing.rows) {
      if (r.state === "retired") continue;
      const topic = poseTopic(r.entity.id);
      const p = topic ? poseAt(cols[topic], t) : null;
      if (!p) continue;
      cars.push({ id: r.entity.id, a: ang(projectToOutline(o, p.x, p.y)) });
    }
  }
  // Labels outside the ring, stepped outwards (then inwards) until they clear the ones already placed.
  const boxes: { x: number; y: number }[] = [];
  const placedCars = cars
    .sort((p, q) => p.a - q.a)
    .map((c) => {
      const tries = [0, 1, 2, 3, -1.6, -2.6];
      let best: { x: number; y: number; r: number } | null = null;
      for (const lv of tries) {
        const r = lv >= 0 ? R + 18 + lv * (CHIP_H + 3) : R + lv * (CHIP_H + 3);
        let [x, y] = at(c.a, r);
        x = Math.min(width - CHIP_W / 2 - 2, Math.max(CHIP_W / 2 + 2, x));
        y = Math.min(height - CHIP_H / 2 - 2, Math.max(CHIP_H / 2 + 2, y));
        const clear = boxes.every((b) => Math.abs(b.x - x) >= CHIP_W + 2 || Math.abs(b.y - y) >= CHIP_H + 2);
        if (clear) {
          best = { x, y, r };
          break;
        }
        if (!best) best = { x, y, r };
      }
      boxes.push(best!);
      return { ...c, lx: best!.x, ly: best!.y };
    });

  const seg = session.segments.find((s) => t >= s.t0 && t <= s.t1) ?? session.segments[session.segments.length - 1];
  const elapsed = seg ? Math.max(0, Math.min(t, seg.t1) - seg.t0) : 0;
  const lap = session.kind === "race" ? Math.min(timing.leaderLaps + 1, session.totalLaps ?? Infinity) : null;

  return (
    <div className={css.wrap} onContextMenu={(e) => openMenu(e, [{ kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Circle map")} data-testid="circle-map">
      {!o && <div className={css.empty}>This file has no track outline</div>}
      {o && (
        <svg width={width} height={height}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line-2)" strokeWidth={6} />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--panel)" strokeWidth={4} />
          {session.corners.map((k) => {
            const a = ang(k.d);
            const [x0, y0] = at(a, R - 3);
            const [x1, y1] = at(a, R - 8);
            const [tx, ty] = at(a, R - 17);
            return (
              <g key={`${k.number}${k.letter}`}>
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--text-3)" />
                {R > 70 && (
                  <text x={tx} y={ty + 3} textAnchor="middle" className={css.corner}>
                    T{k.number}
                    {k.letter}
                  </text>
                )}
              </g>
            );
          })}
          {(() => {
            const [x0, y0] = at(-Math.PI / 2, R - 7);
            const [x1, y1] = at(-Math.PI / 2, R + 7);
            return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--text)" strokeWidth={2} />;
          })()}
          <text x={cx} y={cy - 2} textAnchor="middle" className={css.lap}>
            {lap != null ? `Lap ${lap}${session.totalLaps ? `/${session.totalLaps}` : ""}` : (seg?.label ?? session.sessionName)}
          </text>
          <text x={cx} y={cy + 15} textAnchor="middle" className={css.clock}>
            {fmtClock(elapsed)}
          </text>
          {placedCars.map((c) => {
            const e = session.entityById.get(c.id)!;
            const fill = teamFill(e.colour, dark);
            const [dx, dy] = at(c.a, R);
            const { lx, ly } = c;
            // Leader line from the dot to the nearest edge of the chip.
            const ex = Math.min(lx + CHIP_W / 2, Math.max(lx - CHIP_W / 2, dx));
            const ey = Math.min(ly + CHIP_H / 2, Math.max(ly - CHIP_H / 2, dy));
            const ring = c.id === focus ? "var(--a)" : c.id === compare ? "var(--b)" : null;
            return (
              <g key={c.id} className={css.car} onClick={(ev) => selectEntity(c.id, ev)} onContextMenu={(ev) => { ev.stopPropagation(); openEntityMenu(ev, c.id); }}>
                <line x1={dx} y1={dy} x2={ex} y2={ey} stroke={fill} strokeWidth={1} />
                <circle cx={dx} cy={dy} r={4} fill={fill} stroke="var(--panel)" strokeWidth={1.5} />
                <rect x={lx - CHIP_W / 2} y={ly - CHIP_H / 2} width={CHIP_W} height={CHIP_H} rx={3} fill={fill} stroke={ring ?? "none"} strokeWidth={ring ? 1.5 : 0} />
                <text x={lx} y={ly + 3.5} textAnchor="middle" className={css.code} fill={onColour(fill)}>
                  {e.code}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export const circleMapWidget: WidgetDef = {
  type: "circle",
  name: "Circle map",
  description: "Every car's lap position on a ring, with the lap and clock in the centre",
  group: "Track",
  unavailable: (s, summary) => (!s.outline ? "This file has no track outline." : summary.topics.some((t) => t.pattern && /pose|position/.test(t.pattern)) ? null : "This file has no car positions."),
  Component: CircleMap,
};

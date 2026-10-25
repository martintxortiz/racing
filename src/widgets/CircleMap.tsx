"use client";
import { useMemo } from "react";
import { fmtClock } from "@/data/format";
import type { Outline } from "@/derive/model";
import { poseAt } from "@/derive/trace";
import { openMenu } from "@/state/menu";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { usePanel } from "@/ui/panelContext";
import { poseTopic, useSelection, useT, useTiming, useTopics } from "./hooks";
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

function overlaps(a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** Circle map: every car's lap distance as an angle on a ring, start line at the top, clockwise. */
function CircleMap({ session, width, height }: WidgetProps) {
  const t = useT(10);
  const timing = useTiming(session, t);
  const panel = usePanel();
  // A and B as the Track map shows them, including the implicit top two.
  const sel = useSelection(session, t);
  const focus = sel.a?.entity ?? null;
  const compare = sel.b?.entity ?? null;
  const o = session.outline;
  const poseTopics = useMemo(() => session.entities.map((e) => poseTopic(e.id)).filter((x): x is string => !!x), [session]);
  const { cols } = useTopics(poseTopics);

  const cx = width / 2;
  const cy = height / 2;
  // Leave room outside the ring for one line of labels.
  const R = Math.max(30, Math.min(width, height) / 2 - 22);
  const ang = (d: number) => (o ? (d / o.length) * 2 * Math.PI - Math.PI / 2 : 0);
  const at = (a: number, r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;

  const cars: { id: string; a: number; rank: number }[] = [];
  if (o) {
    timing.rows.forEach((r, i) => {
      if (r.state === "retired") return;
      const topic = poseTopic(r.entity.id);
      const p = topic ? poseAt(cols[topic], t) : null;
      if (!p) return;
      cars.push({ id: r.entity.id, a: ang(projectToOutline(o, p.x, p.y)), rank: r.entity.id === focus || r.entity.id === compare ? -1 : i });
    });
  }
  // Car labels work like the Track map's: a small code beside each dot, tried at four spots and
  // left out when it would touch another label, a dot, a corner number or the centre text.
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const boxes: Box[] = [{ x0: cx - 48, y0: cy - 20, x1: cx + 48, y1: cy + 22 }];
  const cornerLabels = R > 70;
  const labelled = new Set<string>();
  if (cornerLabels)
    for (const k of session.corners) {
      const [x, y] = at(ang(k.d), R - 17);
      const box = { x0: x - 12, y0: y - 7, x1: x + 12, y1: y + 7 };
      if (boxes.slice(1).some((b) => overlaps(b, box))) continue;
      labelled.add(`${k.number}${k.letter}`);
      boxes.push(box);
    }
  for (const c of cars) {
    const [x, y] = at(c.a, R);
    boxes.push({ x0: x - 5, y0: y - 5, x1: x + 5, y1: y + 5 });
  }
  const placedCars = [...cars]
    .sort((p, q) => p.rank - q.rank)
    .map((c) => {
      const code = session.entityById.get(c.id)?.code ?? "";
      const w = code.length * 7 + 2;
      const [x, y] = at(c.a, R);
      // Outside the ring first, on the side the dot faces.
      const out = Math.cos(c.a) >= 0 ? 1 : -1;
      const spots = [
        [9 * out, -8 * (Math.sin(c.a) < 0 ? 1 : -1)],
        [9 * out, 8 * (Math.sin(c.a) < 0 ? 1 : -1)],
        [-9 * out, -8 * (Math.sin(c.a) < 0 ? 1 : -1)],
        [-9 * out, 8 * (Math.sin(c.a) < 0 ? 1 : -1)],
      ];
      let label: { x: number; y: number; anchor: "start" | "end" } | null = null;
      for (const [dx, dy] of spots) {
        const x0 = dx > 0 ? x + dx : x + dx - w;
        const box = { x0: x0 - 1, y0: y + dy - 7, x1: x0 + w + 1, y1: y + dy + 7 };
        const outside = box.x0 < 1 || box.x1 > width - 1 || box.y0 < 1 || box.y1 > height - 1;
        if (outside || (c.rank >= 0 && boxes.some((b) => overlaps(b, box)))) continue;
        boxes.push(box);
        label = { x: x + dx, y: y + dy, anchor: dx > 0 ? "start" : "end" };
        break;
      }
      return { ...c, code, label };
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
                {labelled.has(`${k.number}${k.letter}`) && (
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
            const [dx, dy] = at(c.a, R);
            const ring = c.id === focus ? "var(--a)" : c.id === compare ? "var(--b)" : null;
            // Grey dots; only A and B are coloured.
            const fill = ring ?? "var(--text-3)";
            const l = c.label;
            return (
              <g key={c.id} className={css.car} onClick={(ev) => selectEntity(c.id, ev)} onContextMenu={(ev) => { ev.stopPropagation(); openEntityMenu(ev, c.id); }}>
                <title>{e.name}</title>
                {l && (
                  <text x={l.x} y={l.y + 4} textAnchor={l.anchor} className={css.code} fill={ring ?? "var(--text-2)"} style={{ fontWeight: ring ? 600 : 500 }}>
                    {c.code}
                  </text>
                )}
                <circle cx={dx} cy={dy} r={ring ? 5 : 4} fill={fill} stroke="var(--panel)" strokeWidth={1.5} />
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

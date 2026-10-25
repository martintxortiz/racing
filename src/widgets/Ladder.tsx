"use client";
import { useMemo } from "react";
import { fmtLap } from "@/data/format";
import type { Entity } from "@/derive/model";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip, Pill, TyreGlyph } from "./cells";
import { useT, useTiming } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./ladder.module.css";

export interface LadderConfig {
  /** Each car's last lap (default) or personal best. */
  basis?: "last" | "best";
  /** Axis range in seconds; cars further back sit at the bottom. 0 = auto. */
  range?: number;
}

/** Label pitch: a 20 px pill plus 2 px; labels never overlap, the panel scrolls instead. */
const LABEL_H = 18;
const TOP = 28;
const BOTTOM = 14;
/** From this width each label also shows the lap time itself. */
const WIDE = 230;

/** Place labels near their targets without overlapping: push down, then pull back up from the bottom. */
export function spread(ys: number[], gap: number, lo: number, hi: number): number[] {
  const out = ys.slice();
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], i ? out[i - 1] + gap : lo);
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i < out.length - 1 ? out[i + 1] - gap : hi);
  return out;
}

interface Item {
  entity: Entity;
  time: number;
  delta: number;
  compound: string | null;
}

function Ladder({ session, config, setConfig, width, height }: WidgetProps<LadderConfig>) {
  const t = useT(2);
  const timing = useTiming(session, t);
  const panel = usePanel();
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  // Races compare the latest lap; qualifying and practice compare personal bests.
  const basis = config.basis ?? (session.kind === "race" ? "last" : "best");

  const items = useMemo(() => {
    const list: Omit<Item, "delta">[] = [];
    for (const r of timing.rows) {
      if (r.state === "retired") continue;
      const v = basis === "best" ? r.best : r.last?.valid ? r.last.time : null;
      if (v != null) list.push({ entity: r.entity, time: v, compound: r.compound });
    }
    list.sort((a, b) => a.time - b.time);
    const ref = list[0]?.time ?? 0;
    return list.map((x) => ({ ...x, delta: x.time - ref }));
  }, [timing, basis]);

  const autoRange = items.length ? Math.min(5, Math.max(1, Math.ceil(items[Math.min(items.length - 1, Math.floor(items.length * 0.9))].delta * 2) / 2)) : 3;
  const range = config.range || autoRange;
  const h0 = TOP;
  // Tall enough for every label at full pitch; a short panel scrolls rather than squeezing them.
  const h1 = Math.max(h0 + 40, height - BOTTOM, h0 + Math.max(0, items.length - 1) * LABEL_H);
  const y = (d: number) => h0 + (Math.min(d, range) / range) * (h1 - h0);
  const labelY = spread(
    items.map((x) => y(x.delta)),
    LABEL_H,
    h0,
    h1,
  );
  const wide = width >= WIDE;
  // Narrow panels drop the leader-line elbow and then the tyre, never the size of anything.
  const narrow = width < 200;
  const ax = narrow ? 34 : 42;
  const left = narrow ? ax + 8 : ax + 26;
  const digits = width < 150 ? 2 : 3;
  const showTyre = width >= left + 44 + 6 + 58 + 6 + 18 + 12;
  const ticks: number[] = [];
  const step = range > 3 ? 1 : range > 1.5 ? 0.5 : 0.25;
  for (let v = 0; v <= range + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);

  const menu = (e: React.MouseEvent) =>
    openMenu(
      e,
      [
        { kind: "label", label: "Lap" },
        { id: "last", label: "Last lap", checked: basis === "last", run: () => setConfig({ basis: "last" }) },
        { id: "best", label: "Personal best", checked: basis === "best", run: () => setConfig({ basis: "best" }) },
        { kind: "label", label: "Range" },
        ...[0, 1, 2, 3, 5].map((r) => ({ id: `r${r}`, label: r ? `${r} s` : "Auto", checked: (config.range ?? 0) === r, run: () => setConfig({ range: r }) })),
        { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
      ],
      "Lap time distribution",
    );

  return (
    <div className={css.wrap} onContextMenu={menu} data-testid="lap-ladder">
      {!narrow && (
        <HeaderSlot>
          <span>{basis === "best" ? "Personal best" : "Last lap"}</span>
        </HeaderSlot>
      )}
      <div className={css.ref}>
        <span className={css.refTime}>{items[0] ? fmtLap(items[0].time) : "No laps yet"}</span>
      </div>
      <svg className={css.svg} width="100%" height={h1 + BOTTOM}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={ax - 6} x2={ax} y1={y(v)} y2={y(v)} stroke="var(--line-2)" />
            <text x={ax - 9} y={y(v) + 4} textAnchor="end" className={css.tick}>
              {v === 0 ? "0" : `+${narrow ? +v.toFixed(2) : v.toFixed(step < 0.5 ? 2 : 1)}`}
            </text>
          </g>
        ))}
        <line x1={ax} x2={ax} y1={h0} y2={h1} stroke="var(--line-2)" />
        {items.map((x, i) => (
          <g key={x.entity.id}>
            <path d={narrow ? `M${ax} ${y(x.delta)} L${left} ${labelY[i]}` : `M${ax} ${y(x.delta)} H${ax + 10} L${ax + 20} ${labelY[i]} H${left}`} fill="none" stroke="var(--line-2)" />
            <circle cx={ax} cy={y(x.delta)} r={3.5} fill={x.entity.id === focus ? "var(--a)" : x.entity.id === compare ? "var(--b)" : "var(--text-3)"} stroke="var(--panel)" strokeWidth={1} />
          </g>
        ))}
      </svg>
      {items.map((x, i) => (
        <div
          key={x.entity.id}
          className={css.label}
          style={{ top: labelY[i] - LABEL_H / 2, left }}
          onClick={(e) => selectEntity(x.entity.id, e)}
          onContextMenu={(e) => {
            e.stopPropagation();
            openEntityMenu(e, x.entity.id);
          }}
          title={`${x.entity.name}: ${fmtLap(x.time)}`}
        >
          <DriverChip entity={x.entity} />
          <Pill tone={i === 0 ? "sb" : "none"}>{i === 0 ? (0).toFixed(digits) : `+${x.delta.toFixed(digits)}`}</Pill>
          {wide && <span className={css.time}>{fmtLap(x.time)}</span>}
          <span className={css.grow} />
          {showTyre && <TyreGlyph compound={x.compound} />}
        </div>
      ))}
    </div>
  );
}

export const ladderWidget: WidgetDef<LadderConfig> = {
  type: "ladder",
  name: "Lap time distribution",
  description: "Every car's last lap (race) or best lap as a gap to the fastest, on one vertical scale",
  group: "Timing",
  unavailable: (s) => (s.laps.length ? null : "This file has no lap timing."),
  Component: Ladder,
  menu: ({ config, setConfig, session }) => {
    const basis = config.basis ?? (session.kind === "race" ? "last" : "best");
    return [
      { id: "last", label: "Last lap", checked: basis === "last", run: () => setConfig({ basis: "last" }) },
      { id: "best", label: "Personal best", checked: basis === "best", run: () => setConfig({ basis: "best" }) },
    ];
  },
};

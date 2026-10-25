"use client";
import { useMemo } from "react";
import { DASH, fmtGap, fmtLap, MINUS } from "@/data/format";
import type { SessionModel } from "@/derive/model";
import { indexAtOrBefore } from "@/derive/search";
import { mark, seriesAt, type TimingRow } from "@/derive/timing";
import { speedField } from "@/derive/trace";
import { entityTopics } from "@/derive/topics";
import { sep, type MenuItem } from "@/menus/types";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip, Pill, TyreGlyph, type Tone } from "./cells";
import { useT, useTiming, useTopics } from "./hooks";
import { sectorCell, startPositions, type Ctx } from "./Timing";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./table.module.css";
import tcss from "./tower.module.css";

export interface TowerConfig {
  hidden?: string[];
  /** Opt-in columns the user switched on (off by default). */
  shown?: string[];
  /** Live speed from telemetry (loads every car's telemetry). On by default. */
  liveSpeed?: boolean;
}

interface Extra {
  ctx: Ctx;
  speed: Map<string, number | null>;
  drs: Map<string, number | null>;
  trend: Map<string, number[]>;
}
type Cell = { text: React.ReactNode; tone?: Tone; muted?: boolean };
interface Col {
  id: string;
  label: string;
  title: string;
  width: number;
  align?: "l" | "c";
  race?: boolean;
  /** Off unless switched on from the Columns menu. */
  optIn?: boolean;
  cell: (r: TimingRow, x: Extra) => Cell;
}

const toneOf = (m: "sb" | "pb" | "good" | "bad" | null | undefined): Tone => m ?? "none";

/** Gap to the car ahead at the car's last few lap crossings, newest last. */
function trendSeries(s: SessionModel, id: string, t: number, n = 5): number[] {
  const laps = (s.lapsByEntity.get(id) ?? []).filter((l) => l.t1 != null && l.t1 <= t);
  const out: number[] = [];
  for (const l of laps.slice(-n)) {
    const v = seriesAt(s.intervals, id, "interval_s", l.t1!);
    if (v != null && v < 60) out.push(v);
  }
  return out;
}

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return <span className={css.muted}>{DASH}</span>;
  const W = 48;
  const H = 14;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = Math.max(0.2, hi - lo);
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * (W - 2) + 1).toFixed(1)},${(H - 1 - ((y - lo) / span) * (H - 2)).toFixed(1)}`).join(" ");
  const d = v[v.length - 1] - v[v.length - 2];
  const c = d <= -0.1 ? "var(--good-fg)" : d >= 0.1 ? "var(--bad-fg)" : "var(--text-3)";
  const [lx, ly] = pts.split(" ").pop()!.split(",");
  return (
    <svg width={W} height={H} className={tcss.spark} aria-label="Gap ahead over the last 5 laps">
      <polyline points={pts} fill="none" stroke="var(--text-3)" strokeWidth={1} />
      <circle cx={lx} cy={ly} r={1.8} fill={c} />
    </svg>
  );
}

const COLS: Col[] = [
  { id: "pos", label: "P", title: "Position", width: 26, cell: (r) => ({ text: r.pos ?? DASH }) },
  { id: "driver", label: "Driver", title: "Driver, on the team colour", width: 50, align: "l", cell: () => ({ text: null }) },
  {
    id: "delta",
    label: "+/\u2212",
    title: "Places gained since the start",
    width: 38,
    race: true,
    cell: (r, x) => {
      const s = x.ctx.startPos.get(r.entity.id);
      if (s == null || r.pos == null || r.state === "retired") return { text: DASH, muted: true };
      const d = s - r.pos;
      if (!d) return { text: "0", muted: true };
      return { text: d > 0 ? `+${d}` : `${MINUS}${-d}`, tone: d > 0 ? "good" : "bad" };
    },
  },
  { id: "tyre", label: "Tyre", title: "Compound", width: 30, align: "c", cell: (r) => ({ text: <TyreGlyph compound={r.compound} /> }) },
  { id: "age", label: "Age", title: "Laps on the set", width: 32, cell: (r) => ({ text: r.tyreAge ?? DASH, muted: r.tyreAge == null }) },
  { id: "pit", label: "Pit", title: "Pit stops so far", width: 28, cell: (r) => ({ text: r.pits, muted: !r.pits }) },
  ...([0, 1, 2] as const).map(
    (i): Col => ({
      id: `s${i + 1}`,
      label: `S${i + 1}`,
      title: `Sector ${i + 1}: live on the lap in progress, otherwise the last lap (grey)`,
      width: 52,
      cell: (r, x) => {
        const v = sectorCell(i)(r, x.ctx);
        return { text: v.text, tone: toneOf(v.mark), muted: v.muted || v.missing };
      },
    }),
  ),
  {
    id: "last",
    label: "Last lap",
    title: "Last completed lap",
    width: 68,
    cell: (r, x) => {
      if (!r.last || r.last.time == null) return { text: r.last?.pitIn ? "In lap" : DASH, muted: true };
      const pe = x.ctx.timing.bests.byEntity.get(r.entity.id);
      return { text: fmtLap(r.last.time), tone: r.last.valid ? toneOf(mark(r.last.time, pe?.lap ?? null, x.ctx.timing.bests.lap)) : "none", muted: !r.last.valid };
    },
  },
  {
    id: "best",
    label: "Best lap",
    title: "Personal best lap",
    width: 68,
    cell: (r, x) => ({ text: fmtLap(r.best), tone: r.best != null && x.ctx.timing.bests.lap != null && r.best <= x.ctx.timing.bests.lap + 1e-9 ? "sb" : "none", muted: r.best == null }),
  },
  {
    id: "dlap",
    label: "Delta",
    title: "Last lap minus personal best",
    width: 54,
    cell: (r) => {
      if (r.last?.time == null || r.best == null || !r.last.valid) return { text: DASH, muted: true };
      const d = r.last.time - r.best;
      return { text: d < 0.0005 ? "0.000" : fmtGap(d), muted: d >= 0.0005 };
    },
  },
  {
    id: "gap",
    label: "Gap to leader",
    title: "Gap to the leader",
    width: 84,
    cell: (r, x) => {
      if (x.ctx.kind === "race" && r.lapsDown) return { text: `+${r.lapsDown} lap${r.lapsDown > 1 ? "s" : ""}` };
      if (r.pos === 1) return { text: x.ctx.kind === "race" ? "Leader" : DASH, muted: true };
      return { text: fmtGap(r.gap), muted: r.gap == null };
    },
  },
  {
    id: "int",
    label: "Gap ahead",
    title: "Interval to the car ahead. Race: green closing, red losing over the last lap",
    width: 70,
    cell: (r, x) => {
      if (r.pos === 1 || r.interval == null) return { text: DASH, muted: true };
      const tone: Tone = x.ctx.kind === "race" && r.trend != null ? (r.trend <= -0.25 ? "good" : r.trend >= 0.25 ? "bad" : "none") : "none";
      return { text: fmtGap(r.interval), tone };
    },
  },
  { id: "trend", label: "Last 5 laps trend", title: "Gap to the car ahead at each of the last 5 lap crossings. The dot is green when it shrank on the last lap, red when it grew", width: 100, align: "c", race: true, optIn: true, cell: (r, x) => ({ text: <Spark v={x.trend.get(r.entity.id) ?? []} /> }) },
  {
    id: "spd",
    label: "SPD",
    title: "Speed now from telemetry (km/h), else the last speed trap",
    width: 40,
    cell: (r, x) => {
      const v = x.speed.get(r.entity.id) ?? r.last?.st ?? null;
      return { text: v != null ? Math.round(v) : DASH, muted: v == null };
    },
  },
  {
    id: "drs",
    label: "DRS",
    title: "DRS open (telemetry status code 10 or above)",
    width: 38,
    align: "c",
    cell: (r, x) => {
      const v = x.drs.get(r.entity.id);
      return v != null && v >= 10 ? { text: "On", tone: "info" } : { text: DASH, muted: true };
    },
  },
];

/** Dropped first when the panel is narrow. */
const DROP = ["trend", "dlap", "drs", "spd", "s3", "s2", "s1", "age", "pit", "delta", "best", "int"];
/** Left and right cell padding of the table, outside the columns. */
const EDGE = 16;

/**
 * Keep columns at their natural width and drop the lowest-priority ones until the rest fit.
 * Cells never shrink below their width; spare width is shared out by the fixed table layout.
 */
export function fitColumns<C extends { id: string; width: number }>(all: C[], width: number): { cols: C[]; dropped: C[] } {
  let cols = all;
  const dropped: C[] = [];
  let total = EDGE + cols.reduce((a, c) => a + c.width, 0);
  for (const id of DROP) {
    if (total <= width) break;
    const c = cols.find((x) => x.id === id);
    if (!c) continue;
    cols = cols.filter((x) => x !== c);
    dropped.push(c);
    total -= c.width;
  }
  return { cols, dropped };
}

function columnToggles(config: TowerConfig, setConfig: (c: Partial<TowerConfig>) => void, race: boolean): MenuItem[] {
  const hidden = new Set(config.hidden ?? []);
  const shown = new Set(config.shown ?? []);
  return COLS.filter((c) => c.id !== "pos" && c.id !== "driver" && (!c.race || race)).map((c) => {
    const checked = c.optIn ? shown.has(c.id) : !hidden.has(c.id);
    return {
      id: `col:${c.id}`,
      label: c.label,
      checked,
      run: () =>
        c.optIn
          ? setConfig({ shown: checked ? [...shown].filter((x) => x !== c.id) : [...shown, c.id] })
          : setConfig({ hidden: checked ? [...hidden, c.id] : [...hidden].filter((x) => x !== c.id) }),
    };
  });
}

function TowerTable({ config, setConfig, session, width }: WidgetProps<TowerConfig>) {
  const t = useT(6);
  const timing = useTiming(session, t);
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const pattern = useApp((s) => s.topicMap?.patterns.telemetry);
  const summary = useApp((s) => s.summary);
  const panel = usePanel();
  const race = session.kind === "race";
  const startPos = useMemo(() => startPositions(session), [session]);
  const live = config.liveSpeed !== false;
  const topics = useMemo(() => (live && pattern && summary ? entityTopics(summary, pattern).map((x) => x.name) : []), [live, pattern, summary]);
  const { cols: tele } = useTopics(topics);

  const speed = new Map<string, number | null>();
  const drs = new Map<string, number | null>();
  let hasDrs = false;
  for (const name of topics) {
    const c = tele[name];
    const id = summary?.topics.find((x) => x.name === name)?.entity;
    if (!c || !id) continue;
    const k = indexAtOrBefore(c.t, t);
    const fresh = k >= 0 && t - c.t[k] < 3;
    const sf = speedField(c);
    speed.set(id, fresh && sf && Number.isFinite(c.num[sf][k]) ? c.num[sf][k] : null);
    const d = c.num.drs;
    if (d) {
      if (!hasDrs) for (let i = 0; i < d.length; i += 97) if (Number.isFinite(d[i])) { hasDrs = true; break; }
      drs.set(id, fresh && Number.isFinite(d[k]) ? d[k] : null);
    }
  }
  const tKey = Math.floor(t);
  const wantTrend = race && (config.shown ?? []).includes("trend");
  const trend = useMemo(() => {
    const m = new Map<string, number[]>();
    if (wantTrend) for (const e of session.entities) m.set(e.id, trendSeries(session, e.id, tKey));
    return m;
  }, [session, wantTrend, tKey]);

  const hidden = new Set(config.hidden ?? []);
  const shown = new Set(config.shown ?? []);
  const on = (c: Col) => (c.optIn ? shown.has(c.id) : !hidden.has(c.id));
  const { cols, dropped } = fitColumns(
    COLS.filter((c) => (!c.race || race) && on(c) && (c.id !== "drs" || hasDrs)),
    width,
  );
  const extra: Extra = { ctx: { timing, kind: session.kind, session, t, startPos }, speed, drs, trend };

  const columnItems = (): MenuItem[] => [
    ...columnToggles(config, setConfig, race).map((m) => ("id" in m && m.id === "col:drs" && !hasDrs ? { ...m, disabled: true, hint: "no data" } : m)),
    sep,
    { id: "reset", label: "Reset columns", run: () => setConfig({ hidden: [], shown: [] }) },
  ];
  const hide = (c: Col) => setConfig(c.optIn ? { shown: [...shown].filter((x) => x !== c.id) } : { hidden: [...hidden, c.id] });
  const menu = (): MenuItem[] => [
    { kind: "sub", id: "columns", label: "Columns", items: columnItems() },
    { id: "live-speed", label: "Live speed from telemetry", checked: live, run: () => setConfig({ liveSpeed: !live }) },
  ];
  const headerMenu = (e: React.MouseEvent, col?: Col) =>
    openMenu(
      e,
      [
        ...(col && col.id !== "pos" && col.id !== "driver" ? [{ id: "hide", label: `Hide ${col.label}`, run: () => hide(col) } as MenuItem, sep] : []),
        ...menu(),
        sep,
        { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
      ],
      col?.title,
    );

  return (
    <div className={css.scroll}>
      <HeaderSlot>
        {race && <span className="num">Lap {Math.min(timing.leaderLaps + 1, session.totalLaps ?? Infinity)}{session.totalLaps ? `/${session.totalLaps}` : ""}</span>}
        {!race && session.segments[timing.segment] && <span>{session.segments[timing.segment].label}</span>}
        {dropped.length > 0 && (
          <button
            className={tcss.hiddenNote}
            title={`Hidden to fit: ${dropped.map((c) => c.label).join(", ")}. Widen the panel to show them.`}
            onClick={(e) => openMenu(e, columnItems(), "Columns")}
          >
            {dropped.length} hidden
          </button>
        )}
      </HeaderSlot>
      <table className={`${css.table} ${tcss.tower} num`} data-testid="ranking-tower">
        <colgroup>
          {cols.map((c) => (
            <col key={c.id} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr onContextMenu={(e) => headerMenu(e)}>
            {cols.map((c) => (
              <th key={c.id} className={c.align === "l" ? css.l : c.align === "c" ? tcss.c : ""} title={c.title} onContextMenu={(e) => headerMenu(e, c)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timing.rows.map((r) => {
            const sel = r.entity.id === focus ? "a" : r.entity.id === compare ? "b" : undefined;
            const inPit = r.state === "pit";
            const lead = inPit ? cols.findIndex((c) => c.id === "driver") + 1 : cols.length;
            return (
              <tr
                key={r.entity.id}
                data-sel={sel}
                data-entity={r.entity.id}
                className={r.state === "retired" || r.state === "eliminated" ? css.dim : ""}
                onClick={(e) => selectEntity(r.entity.id, e)}
                onContextMenu={(e) => {
                  const td = (e.target as HTMLElement).closest("td");
                  const col = cols.find((c) => c.id === td?.dataset.col);
                  const text = td?.innerText.trim();
                  openEntityMenu(e, r.entity.id, [
                    ...(text && col && col.id !== "driver" ? [{ id: "copy", label: `Copy ${col.label}`, hint: text.slice(0, 12), run: () => navigator.clipboard?.writeText(text) } as MenuItem] : []),
                    ...(col && col.id !== "pos" && col.id !== "driver" ? [{ id: "hide-col", label: `Hide ${col.label}`, run: () => hide(col) } as MenuItem] : []),
                    { kind: "sub", id: "columns", label: "Columns", items: columnItems() },
                    { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
                  ]);
                }}
              >
                {cols.slice(0, lead).map((c) => {
                  if (c.id === "driver")
                    return (
                      <td key={c.id} data-col="driver" className={css.l}>
                        <DriverChip entity={r.entity} />
                      </td>
                    );
                  const v = c.cell(r, extra);
                  return (
                    <td key={c.id} data-col={c.id} className={c.align === "l" ? css.l : c.align === "c" ? tcss.c : ""}>
                      <Pill tone={v.tone} muted={v.muted}>
                        {v.text}
                      </Pill>
                    </td>
                  );
                })}
                {inPit && (
                  <td colSpan={cols.length - lead} className={tcss.pitCell}>
                    <Pill tone="warn" block>
                      In pit lane
                    </Pill>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!timing.rows.length && <div className={css.empty}>No entities in this file</div>}
    </div>
  );
}

export const towerWidget: WidgetDef<TowerConfig> = {
  type: "tower",
  name: "Ranking tower",
  description: "Running order with tyre, pit stops, sectors, laps, gaps and speed",
  group: "Timing",
  unavailable: (s) => (s.entities.length ? null : "This file has no entity list or lap timing."),
  Component: TowerTable,
  menu: ({ config, setConfig, session }) => [
    { kind: "sub", id: "columns", label: "Columns", items: columnToggles(config, setConfig, session.kind === "race") },
    { id: "live-speed", label: "Live speed from telemetry", checked: config.liveSpeed !== false, run: () => setConfig({ liveSpeed: config.liveSpeed === false }) },
  ],
};

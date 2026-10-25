"use client";
import { Fragment, useMemo } from "react";
import { DASH, fmtGap, fmtLap, fmtSector } from "@/data/format";
import type { SessionKind, SessionModel } from "@/derive/model";
import { mark, seriesAt, type Mark, type Timing, type TimingRow } from "@/derive/timing";
import { sep, type MenuItem } from "@/menus/types";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip, Pill, TyreGlyph } from "./cells";
import { useT, useTiming } from "./hooks";
import { fitColumns } from "./fit";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./table.module.css";

export interface TimingConfig {
  compact?: boolean;
  /** Group rows by the last session phase (segment) each car took part in. Off by default. */
  groupByPhase?: boolean;
  hidden?: string[];
  shown?: string[];
}

export interface Ctx {
  timing: Timing;
  kind: SessionKind;
  session: SessionModel;
  t: number;
  startPos: Map<string, number>;
}

interface Col {
  id: string;
  label: string;
  title: string;
  kinds?: SessionKind[];
  left?: boolean;
  hidden?: boolean;
  compact?: boolean;
  cell: (r: TimingRow, c: Ctx) => { text: React.ReactNode; mark?: Mark | "good" | "bad"; muted?: boolean; missing?: boolean };
}


export function sectorCell(i: 0 | 1 | 2) {
  return (r: TimingRow, c: Ctx) => {
    const pe = c.timing.bests.byEntity.get(r.entity.id);
    // On a lap in progress, finished sectors show live; the rest show the previous lap, greyed.
    if (r.live.lap) {
      const liveV = r.live.sectors[i];
      if (liveV != null) return { text: fmtSector(liveV), mark: r.live.lap.deleted ? undefined : mark(liveV, pe?.sectors[i] ?? null, c.timing.bests.sectors[i]) };
      const prev = r.last?.s[i] ?? null;
      if (prev != null) return { text: fmtSector(prev), muted: true };
      return { text: r.last?.pitOut && i === 0 ? "out" : DASH, missing: true };
    }
    const v = r.last?.s[i] ?? null;
    // Timing feeds drop S1 on out laps (the car starts mid-sector); say so instead of a bare dash.
    if (v == null) return { text: r.last?.pitOut && i === 0 ? "out" : DASH, missing: true };
    return { text: fmtSector(v), mark: r.last?.deleted ? undefined : mark(v, pe?.sectors[i] ?? null, c.timing.bests.sectors[i]), muted: !!r.last?.deleted };
  };
}

const COLS: Col[] = [
  { id: "pos", label: "Pos", title: "Position", compact: true, cell: (r) => ({ text: r.pos ?? DASH }) },
  { id: "driver", label: "Driver", title: "Driver, filled with the team colour", left: true, compact: true, cell: () => ({ text: null }) },
  {
    id: "best",
    label: "Best",
    title: "Best lap (this phase in qualifying)",
    kinds: ["qualifying", "practice", "race"],
    compact: true,
    cell: (r, c) => ({ text: fmtLap(r.best), mark: r.eliminatedIn == null && r.best != null && c.timing.bests.lap != null && r.best <= c.timing.bests.lap + 1e-9 ? "sb" : undefined }),
  },
  {
    id: "gap",
    label: "Gap",
    title: "Gap to the leader",
    compact: true,
    cell: (r, c) => {
      if (c.kind === "race" && r.lapsDown) return { text: `+${r.lapsDown} L` };
      if (r.pos === 1 && r.gap != null) return { text: c.kind === "race" ? "Leader" : DASH, muted: true };
      return { text: fmtGap(r.gap) };
    },
  },
  {
    id: "int",
    label: "Int",
    title: "Interval to the car ahead. Race: green closing, red opening over the last lap",
    compact: true,
    cell: (r, c) => {
      if (r.pos === 1 || r.interval == null) return { text: DASH, muted: true };
      const m = c.kind === "race" && r.trend != null ? (r.trend <= -0.25 ? "good" : r.trend >= 0.25 ? "bad" : undefined) : undefined;
      return { text: fmtGap(r.interval), mark: m };
    },
  },
  {
    id: "last",
    label: "Last",
    title: "Last completed lap",
    compact: true,
    cell: (r, c) => {
      if (!r.last) return { text: DASH, muted: true };
      const pe = c.timing.bests.byEntity.get(r.entity.id);
      const sbRef = c.timing.bests.lap;
      const tag = r.last.deleted ? "del" : r.last.pitIn ? "in" : r.last.pitOut ? "out" : "";
      const text = r.last.time == null ? (tag || DASH) : fmtLap(r.last.time);
      return {
        text: tag && r.last.time != null ? (
          <>
            <span className={css.muted} style={{ fontSize: 10.5, marginRight: 4 }}>
              {tag}
            </span>
            {r.last.deleted ? <s>{text}</s> : text}
          </>
        ) : (
          text
        ),
        mark: r.last.valid ? mark(r.last.time, pe?.lap ?? null, sbRef) : undefined,
        muted: !r.last.valid,
      };
    },
  },
  { id: "s1", label: "S1", title: "Sector 1 (live on the lap in progress)", cell: sectorCell(0) },
  { id: "s2", label: "S2", title: "Sector 2", cell: sectorCell(1) },
  { id: "s3", label: "S3", title: "Sector 3", cell: sectorCell(2) },
  {
    id: "st",
    label: "Trap",
    title: "Speed trap, last lap (km/h)",
    hidden: true,
    cell: (r, c) => ({ text: r.last?.st ?? DASH, mark: r.last?.st != null && r.last.st >= (c.timing.bests.speedTrap ?? Infinity) ? "sb" : undefined }),
  },
  {
    id: "tyre",
    label: "Tyre",
    title: "Compound and laps on the set",
    cell: (r) => {
      if (!r.compound) return { text: DASH, muted: true };
      return {
        text: (
          <span className={css.tyre}>
            <TyreGlyph compound={r.compound} />
            <span className={css.tyreAge}>{r.tyreAge ?? ""}</span>
          </span>
        ),
      };
    },
  },
  { id: "laps", label: "Laps", title: "Laps completed", cell: (r) => ({ text: r.laps || DASH, muted: !r.laps }) },
  { id: "pits", label: "Pits", title: "Pit stops so far", kinds: ["race", "practice"], cell: (r) => ({ text: r.pits || DASH, muted: !r.pits }) },
  {
    id: "delta",
    label: "+/−",
    title: "Places gained since the start",
    kinds: ["race"],
    cell: (r, c) => {
      const s = c.startPos.get(r.entity.id);
      if (s == null || r.pos == null || r.state === "retired") return { text: DASH, muted: true };
      const d = s - r.pos;
      if (!d) return { text: "0", muted: true };
      return { text: d > 0 ? `+${d}` : `\u2212${-d}`, mark: d > 0 ? "good" : "bad" };
    },
  },
  {
    id: "state",
    label: "",
    title: "In pit, eliminated or retired",
    left: true,
    cell: (r) => ({ text: <span className={css.state}>{r.state === "pit" ? "Pit" : r.state === "retired" ? "Out" : ""}</span> }),
  },
];

/** Race: each car's position just after the start, for places gained. */
export function startPositions(session: SessionModel): Map<string, number> {
  const m = new Map<string, number>();
  const t0 = session.segments[0]?.t0;
  if (session.kind !== "race" || t0 == null) return m;
  for (const e of session.entities) {
    const p = seriesAt(session.order, e.id, "position", t0 + 5);
    if (p != null) m.set(e.id, p);
  }
  return m;
}

function visibleCols(cfg: TimingConfig, kind: SessionKind): Col[] {
  return COLS.filter((c) => {
    if (c.kinds && !c.kinds.includes(kind)) return false;
    if (cfg.compact) return c.compact && !(kind === "race" && c.id === "best") && !(kind !== "race" && c.id === "int");
    if (cfg.hidden?.includes(c.id)) return false;
    if (c.hidden && !cfg.shown?.includes(c.id)) return false;
    return true;
  });
}

function columnMenu(cfg: TimingConfig, setConfig: (p: Partial<TimingConfig>) => void, kind: SessionKind): MenuItem[] {
  const vis = new Set(visibleCols({ ...cfg, compact: false }, kind).map((c) => c.id));
  return [
    { id: "compact", label: "Compact", checked: !!cfg.compact, run: () => setConfig({ compact: !cfg.compact }) },
    { id: "group-phase", label: "Group by session phase", checked: !!cfg.groupByPhase, run: () => setConfig({ groupByPhase: !cfg.groupByPhase }) },
    {
      kind: "sub",
      id: "columns",
      label: "Columns",
      disabled: !!cfg.compact,
      items: [
        ...COLS.filter((c) => c.id !== "pos" && c.id !== "driver" && (!c.kinds || c.kinds.includes(kind))).map((c) => ({
          id: `col:${c.id}`,
          label: c.label || "Status",
          checked: vis.has(c.id),
          run: () => {
            const on = vis.has(c.id);
            const hidden = new Set(cfg.hidden ?? []);
            const shown = new Set(cfg.shown ?? []);
            if (on) {
              hidden.add(c.id);
              shown.delete(c.id);
            } else {
              hidden.delete(c.id);
              if (c.hidden) shown.add(c.id);
            }
            setConfig({ hidden: [...hidden], shown: [...shown] });
          },
        })),
        sep,
        { id: "reset", label: "Reset columns", run: () => setConfig({ hidden: [], shown: [] }) },
      ],
    },
  ];
}

function TimingTable({ config, setConfig, session, width }: WidgetProps<TimingConfig>) {
  const t = useT(8);
  const timing = useTiming(session, t);
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const panel = usePanel();
  const kind = session.kind;
  const fit = fitColumns(visibleCols(config, kind), width, kind);
  const cols = fit.cols;
  const startPos = useMemo(() => startPositions(session), [session]);
  const ctx: Ctx = { timing, kind, session, t, startPos };
  const seg = session.segments[timing.segment];

  const headerMenu = (e: React.MouseEvent, col?: Col) =>
    openMenu(e, [
      ...(col && col.id !== "pos" && col.id !== "driver" && !config.compact
        ? [{ id: "hide", label: `Hide ${col.label || "status"} column`, run: () => setConfig({ hidden: [...(config.hidden ?? []), col.id], shown: (config.shown ?? []).filter((x) => x !== col.id) }) } as MenuItem, sep]
        : []),
      ...columnMenu(config, setConfig, kind),
      sep,
      { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
    ], col?.title);

  return (
    <div className={css.scroll}>
      <HeaderSlot>
        {kind === "qualifying" && seg && <span>{seg.label}</span>}
        {kind === "race" && <span className="num">Lap {Math.min(timing.leaderLaps + 1, session.totalLaps ?? Infinity)}{session.totalLaps ? ` / ${session.totalLaps}` : ""}</span>}
        {fit.dropped.length > 0 && <span title="Widen the panel or hide other columns to show them">{fit.dropped.length} {fit.dropped.length === 1 ? "column" : "columns"} hidden to fit</span>}
        {timing.bests.lap != null && width > 420 && (
          <span>
            Best <span className="num" style={{ color: "var(--text)" }}>{fmtLap(timing.bests.lap)}</span>{" "}
            {timing.bests.lapRef && session.entityById.get(timing.bests.lapRef.entity)?.code}
          </span>
        )}
      </HeaderSlot>
      <table className={`${css.table} num`} data-testid="timing-table">
        <thead>
          <tr onContextMenu={(e) => headerMenu(e)}>
            <th className={css.sel} />
            {cols.map((c) => (
              <th key={c.id} className={c.left ? css.l : ""} title={c.title} onContextMenu={(e) => headerMenu(e, c)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timing.rows.map((r, ri) => {
            const sel = r.entity.id === focus ? "a" : r.entity.id === compare ? "b" : undefined;
            const grouped = !!config.groupByPhase;
            const group = grouped ? r.eliminatedIn : null;
            const prev = grouped && ri > 0 ? timing.rows[ri - 1].eliminatedIn : null;
            const showGroup = group != null && group !== prev;
            const dim = r.state === "retired" || (grouped && r.state === "eliminated");
            return (
              <Fragment key={r.entity.id}>
                {showGroup && (
                  <tr className={css.groupRow}>
                    <td colSpan={cols.length + 1}>Last ran in {session.segments[group!]?.label ?? "an earlier phase"}</td>
                  </tr>
                )}
                <tr
                  data-sel={sel}
                  data-entity={r.entity.id}
                  className={dim ? css.dim : ""}
                  onClick={(e) => selectEntity(r.entity.id, e)}
                  onContextMenu={(e) => {
                    const td = (e.target as HTMLElement).closest("td");
                    const colId = td?.dataset.col;
                    const col = cols.find((c) => c.id === colId);
                    const text = td?.innerText.trim();
                    openEntityMenu(e, r.entity.id, [
                      ...(text && col && col.id !== "driver" ? [{ id: "copy", label: `Copy ${col.label || "value"}`, hint: text.slice(0, 12), run: () => navigator.clipboard?.writeText(text) } as MenuItem] : []),
                      ...(col && col.id !== "pos" && col.id !== "driver" && !config.compact
                        ? [{ id: "hide-col", label: `Hide ${col.label || "status"} column`, run: () => setConfig({ hidden: [...(config.hidden ?? []), col.id] }) } as MenuItem]
                        : []),
                      { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
                    ]);
                  }}
                >
                  <td className={`${css.sel} ${sel === "a" ? css.selA : css.selB}`}>{sel ? sel.toUpperCase() : ""}</td>
                  {cols.map((c) => {
                    if (c.id === "driver") {
                      return (
                        <td key={c.id} data-col="driver" className={`${css.l} ${css.driver}`}>
                          <DriverChip entity={r.entity} />
                        </td>
                      );
                    }
                    const v = c.cell(r, ctx);
                    return (
                      <td key={c.id} data-col={c.id} className={`${c.left ? css.l : ""} ${v.missing ? css.missing : ""}`}>
                        <Pill tone={v.mark ?? "none"} muted={v.muted}>
                          {v.text}
                        </Pill>
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {!timing.rows.length && <div className={css.empty}>No entities in this file</div>}
    </div>
  );
}

export const timingWidget: WidgetDef<TimingConfig> = {
  type: "timing",
  name: "Timing",
  description: "Classification with gaps, sectors and tyres at the replay time",
  group: "Timing",
  unavailable: (s) => (s.entities.length ? null : "This file has no entity list or lap timing."),
  Component: TimingTable,
  menu: ({ config, setConfig, session }) => columnMenu(config, setConfig, session.kind),
};

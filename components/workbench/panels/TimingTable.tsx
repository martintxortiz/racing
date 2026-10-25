"use client";

import { useMemo } from "react";

import { nextSort, moveColumn, sortBy, toggleColumn, type SortState } from "@/lib/workbench/columns";
import { classesOf, sectorCount, timingAt, type CellFlag, type TimingInput, type TimingRow } from "@/lib/workbench/derive";
import { fmtLap, fmtSector, fmtSigned } from "@/lib/workbench/format";
import { slotOf } from "@/lib/workbench/selection";
import type { Entity } from "@/lib/workbench/types";
import { usePalette } from "../colors";
import { cfg, check, entityMenuItems, openPanelMenu, patch, radio } from "../menus";
import { focusEntity, toggleCompare, useWB, type MenuItem } from "../state";
import { Empty, Readout, Skeleton, useThrottledT, useTopicState, type PanelDef, type PanelProps } from "./common";

/** Every column the table knows. "sectors" expands to as many sector columns as the feed has. */
export const TIMING_COLUMNS = ["pos", "num", "driver", "name", "team", "cls", "crew", "tyre", "best", "gap", "int", "sectors", "last", "laps", "pits"] as const;
export const DEFAULT_COLUMNS = ["pos", "driver", "tyre", "best", "gap", "int", "sectors", "last", "laps"];

const META: Record<string, { label: string; title: string; num?: boolean; width: number }> = {
  pos: { label: "Pos", title: "Position", num: true, width: 30 },
  num: { label: "No.", title: "Car number", num: true, width: 34 },
  driver: { label: "Driver", title: "Driver / car code", width: 64 },
  name: { label: "Name", title: "Full name", width: 120 },
  team: { label: "Team", title: "Team", width: 110 },
  cls: { label: "Class", title: "Class / category", width: 54 },
  crew: { label: "In car", title: "Driver in the car (driver swaps)", width: 90 },
  tyre: { label: "Tyre", title: "Compound and age", width: 44 },
  best: { label: "Best", title: "Best lap", num: true, width: 64 },
  gap: { label: "Gap", title: "Gap", num: true, width: 64 },
  int: { label: "Int", title: "Interval to the car ahead", num: true, width: 60 },
  sectors: { label: "Sectors", title: "Sector times", num: true, width: 48 },
  last: { label: "Last", title: "Last lap", num: true, width: 64 },
  laps: { label: "Laps", title: "Completed laps", num: true, width: 34 },
  pits: { label: "Pits", title: "Pit stops", num: true, width: 32 },
};

const flagClass = (f: CellFlag) => (f === "purple" ? "pw-c-purple" : f === "green" ? "pw-c-pb" : undefined);

export function tyreClass(compound: string) {
  const c = compound.toUpperCase();
  if (c.startsWith("S")) return "soft";
  if (c.startsWith("M")) return "medium";
  if (c.startsWith("H")) return "hard";
  if (c.startsWith("I")) return "inter";
  if (c.startsWith("W")) return "wet";
  return "unknown";
}

type Col = { key: string; base: string; sector?: number };

/** Sort value of a cell, for header sorting. */
function sortValue(r: TimingRow, c: Col, ent: Entity | undefined): number | string | null {
  switch (c.base) {
    case "pos":
      return r.pos ?? r.rank;
    case "num":
      return ent?.number ?? null;
    case "driver":
      return ent?.code ?? r.entity;
    case "name":
      return ent?.name ?? null;
    case "team":
      return ent?.team ?? null;
    case "cls":
      return r.cls;
    case "crew":
      return r.driver;
    case "tyre":
      return r.tyre?.age ?? null;
    case "best":
      return r.best?.time ?? null;
    case "gap":
      return r.gap === null ? null : r.lapsDown * 1e6 + r.gap;
    case "int":
      return r.interval;
    case "sectors":
      return r.sectors[c.sector!] ?? null;
    case "last":
      return r.last?.time ?? null;
    case "laps":
      return r.laps;
    case "pits":
      return r.pits;
  }
  return null;
}

function TimingTable({ id, panel }: PanelProps) {
  const derived = useWB((s) => s.derived);
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  const session = useWB((s) => s.session);
  const sel = useWB((s) => s.sel);
  const hover = useWB((s) => s.hoverEntity);
  const t = useThrottledT(10);
  const p = usePalette();
  const lapsTopic = panel.bindings.laps ?? "/timing/laps";
  const state = useTopicState(lapsTopic);
  const c = panel.config;
  const sort = (c.sort as SortState | null | undefined) ?? null;
  const showHidden = c.showHidden === true;
  const group = (c.group as string | undefined) ?? "auto";

  const input = useMemo((): TimingInput | null => {
    if (!derived) return null;
    const auto = session?.kind === "race" ? "race" : "best";
    return {
      entities: derived.entities.map((e) => ({ id: e.id, class: e.class })),
      laps: derived.lapsByEntity,
      segments: derived.segments,
      classification: panel.bindings.order ? store.get(panel.bindings.order) : undefined,
      stints: panel.bindings.stints ? store.get(panel.bindings.stints)?.rows : undefined,
      pits: panel.bindings.pits ? store.get(panel.bindings.pits) : undefined,
      scope: (c.scope as "session" | "part") ?? "session",
      gapMode: c.gapMode === "race" || c.gapMode === "best" ? c.gapMode : auto,
      gapTo: c.gapTo === "leader" || c.gapTo === "class" ? c.gapTo : c.gapTo === "reference" && sel.reference ? { entity: sel.reference } : "auto",
    };
    // version: the store is mutable and grows while loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, version, session?.kind, panel.bindings, c.scope, c.gapMode, c.gapTo, sel.reference]);

  const rows = useMemo(() => (input ? timingAt(input, t) : []), [input, t]);
  const nSec = useMemo(() => (derived ? sectorCount(derived.lapsByEntity.values()) : 0), [derived]);
  const classes = useMemo(() => classesOf(derived?.entities ?? []), [derived]);

  // Columns: configured order; columns without data in this recording drop out on their own.
  const has = useMemo(
    () => ({
      tyre: rows.some((r) => r.tyre),
      pits: rows.some((r) => r.pits > 0) || !!input?.pits?.length,
      crew: rows.some((r) => r.driver),
      cls: classes.length > 0,
      team: (derived?.entities ?? []).some((e) => e.team),
      num: (derived?.entities ?? []).some((e) => e.number != null),
      sectors: nSec > 0,
    }),
    [rows, input, classes, derived, nSec],
  );
  const configured = ((c.columns as string[] | undefined) ?? DEFAULT_COLUMNS).filter((k) => META[k]);
  const cols: Col[] = configured
    .filter((k) => has[k as keyof typeof has] !== false)
    .flatMap((k) => (k === "sectors" ? Array.from({ length: nSec }, (_, i) => ({ key: `s${i + 1}`, base: k, sector: i })) : [{ key: k, base: k }]));

  if (state === "loading" || (!derived && state !== "missing")) return <Skeleton rows={10} />;
  if (state === "missing" || !derived) return <Empty title="No lap data">Bind a laps topic from the panel menu.</Empty>;

  const visible = rows.filter((r) => showHidden || !sel.hidden.includes(r.entity));
  const sortCol = sort ? cols.find((x) => x.key === sort.key) : undefined;
  let ordered = sortCol ? sortBy(visible, (r) => sortValue(r, sortCol, derived.entityById.get(r.entity)), sort!.dir) : visible;
  const grouped = classes.length > 0 && group !== "none" && !sortCol;
  if (grouped) ordered = classes.flatMap((k) => ordered.filter((r) => r.cls === k)).concat(ordered.filter((r) => !r.cls || !classes.includes(r.cls)));
  const race = input?.gapMode === "race";

  const cell = (r: TimingRow, col: Col) => {
    const e = derived.entityById.get(r.entity);
    switch (col.base) {
      case "pos":
        return grouped ? r.rank : (r.pos ?? r.rank);
      case "num":
        return e?.number ?? "";
      case "driver": {
        const k = slotOf(sel, r.entity);
        return (
          <span className="wb-driver" title={`${e?.name ?? ""}${e?.number != null ? ` #${e.number}` : ""}${e?.team ? ` · ${e.team}` : ""}`}>
            <i className="wb-dot" style={{ background: k >= 0 ? p.series[k % p.series.length] : "transparent" }} />
            <i className="pw-team" style={{ ["--c" as string]: e?.colour }} />
            <span className={r.entity === sel.focus ? "pw-strong" : undefined}>{e?.code ?? r.entity}</span>
          </span>
        );
      }
      case "name":
        return <span className="wb-ellipsis">{e?.name ?? ""}</span>;
      case "team":
        return <span className="wb-ellipsis pw-faint">{e?.team ?? ""}</span>;
      case "cls":
        return r.cls ?? "";
      case "crew":
        return <span className="wb-ellipsis">{r.driver ?? ""}</span>;
      case "tyre":
        return r.tyre ? (
          <span className="wb-tyre" title={`${r.tyre.compound}, ${r.tyre.age} laps`}>
            <span className={`pw-tyre pw-tyre--${tyreClass(r.tyre.compound)}`}>{r.tyre.compound[0]}</span>
            <span className="pw-tyre-age">{r.tyre.age}</span>
          </span>
        ) : (
          <span className="pw-faint">—</span>
        );
      case "best":
        return <span className={flagClass(r.bestFlag)}>{fmtLap(r.best?.time)}</span>;
      case "gap":
        if (r.lapsDown > 0) return `+${r.lapsDown} L`;
        return r.gap === null ? "" : r.gap === 0 ? <span className="pw-faint">—</span> : fmtSigned(r.gap);
      case "int":
        return r.interval === null || r.interval === 0 ? <span className="pw-faint">—</span> : fmtSigned(r.interval);
      case "sectors":
        return <span className={flagClass(r.sectorFlags[col.sector!])}>{fmtSector(r.sectors[col.sector!])}</span>;
      case "last":
        if (!r.last) return <span className="pw-faint">—</span>;
        if (r.last.deleted)
          return (
            <s className="pw-faint" title={r.last.deletedReason}>
              {fmtLap(r.last.time)}
            </s>
          );
        return <span className={flagClass(r.lastFlag)}>{fmtLap(r.last.time)}</span>;
      case "laps":
        return r.laps;
      case "pits":
        return r.pits;
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    const i = ordered.findIndex((r) => r.entity === sel.focus);
    const next = ordered[Math.max(0, Math.min(ordered.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) focusEntity(next.entity);
  };

  const body: React.ReactNode[] = [];
  let lastCls: string | null | undefined;
  for (const r of ordered) {
    if (grouped && r.cls !== lastCls) {
      body.push(
        <tr key={`g-${r.cls}`} className="wb-timing__group">
          <td colSpan={cols.length}>{r.cls ?? "Other"}</td>
        </tr>,
      );
      lastCls = r.cls;
    }
    const hidden = sel.hidden.includes(r.entity);
    body.push(
      <tr
        key={r.entity}
        className={[
          sel.compare.includes(r.entity) && "is-selected",
          r.entity === sel.focus && "is-focus",
          r.entity === hover && "is-hover",
          hidden && "is-hidden",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggleCompare(r.entity) : focusEntity(r.entity))}
        onContextMenu={(e) => {
          e.preventDefault();
          openPanelMenu(id, e.clientX, e.clientY, () => entityMenuItems(r.entity));
        }}
        onPointerEnter={() => useWB.setState({ hoverEntity: r.entity })}
        onPointerLeave={() => useWB.setState({ hoverEntity: null })}
      >
        {cols.map((col) => (
          <td key={col.key} className={META[col.base].num ? "is-num" : undefined}>
            {cell(r, col)}
          </td>
        ))}
      </tr>,
    );
  }

  return (
    <>
      <Readout>
        <span className="pw-faint">
          {race ? "Gaps by elapsed time" : "Gaps by best lap"}
          {sortCol ? ` · sorted by ${sortCol.key === sortCol.base ? META[sortCol.base].label : sortCol.key.toUpperCase()}` : ""}
        </span>
      </Readout>
      <table className="pw-table wb-timing" tabIndex={0} onKeyDown={onKey}>
        <colgroup>
          {cols.map((col) => (
            <col key={col.key} style={{ width: META[col.base].width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((col) => (
              <th
                key={col.key}
                title={col.sector !== undefined ? `Sector ${col.sector + 1} (best lap)` : META[col.base].title}
                className={[META[col.base].num && "is-num", sort?.key === col.key && "is-sorted"].filter(Boolean).join(" ")}
                aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                onClick={() => patch(id, { sort: nextSort(sort, col.key) })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openPanelMenu(id, e.clientX, e.clientY, () => columnMenu(id, col.key, col.base));
                }}
              >
                {col.sector !== undefined ? `S${col.sector + 1}` : META[col.base].label}
                {sort?.key === col.key ? <span className={`wb-sort pw-icon pw-icon--caret-${sort.dir === "asc" ? "up" : "down"}`} /> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </>
  );
}

/** Header right-click: sort, hide, move and the full column chooser. */
export function columnMenu(id: string, key: string, base: string): MenuItem[] {
  const cols = cfg<string[]>(id, "columns", DEFAULT_COLUMNS);
  const sort = cfg<SortState | null>(id, "sort", null);
  const label = key.startsWith("s") && base === "sectors" ? `Sector ${key.slice(1)}` : META[base].title;
  const all = [...TIMING_COLUMNS];
  return [
    { heading: label },
    { label: "Sort ascending", radio: true, checked: sort?.key === key && sort.dir === "asc", onSelect: () => patch(id, { sort: { key, dir: "asc" } }) },
    { label: "Sort descending", radio: true, checked: sort?.key === key && sort.dir === "desc", onSelect: () => patch(id, { sort: { key, dir: "desc" } }) },
    { label: "Official order", radio: true, checked: !sort, onSelect: () => patch(id, { sort: null }) },
    { separator: true },
    { label: base === "sectors" ? "Hide sector columns" : "Hide column", disabled: cols.length <= 1, onSelect: () => patch(id, { columns: toggleColumn(cols, base, all) }) },
    { label: "Move left", disabled: cols.indexOf(base) <= 0, onSelect: () => patch(id, { columns: moveColumn(cols, base, -1) }) },
    { label: "Move right", disabled: cols.indexOf(base) >= cols.length - 1, onSelect: () => patch(id, { columns: moveColumn(cols, base, 1) }) },
  ];
}

/** Checkbox list of every column, plus reset. */
function columnChooser(id: string, nSec: number, has: Record<string, boolean>): MenuItem[] {
  const all = [...TIMING_COLUMNS];
  const now = cfg<string[]>(id, "columns", DEFAULT_COLUMNS);
  return [
    ...all.map((k) => ({
      label: k === "sectors" ? `Sectors${nSec ? ` (${nSec})` : ""}` : META[k].title,
      hint: has[k] === false ? "no data" : undefined,
      checked: now.includes(k),
      keepOpen: true,
      onSelect: () => patch(id, { columns: toggleColumn(cfg<string[]>(id, "columns", DEFAULT_COLUMNS), k, all) }),
    })),
    { separator: true },
    { label: "Reset columns", onSelect: () => patch(id, { columns: DEFAULT_COLUMNS, sort: null }) },
  ];
}

export const timingTable: PanelDef = {
  type: "timing-table",
  title: "Timing",
  description: "Order, gaps, sectors and tyres at the cursor. Any series, any session; classes grouped.",
  icon: "data-table",
  primary: "laps",
  needs: ["/timing/laps"],
  slots: {
    order: { schemas: ["rtc.classification"], required: false, default: "/timing/classification" },
    laps: { schemas: ["rtc.laps"], required: true, default: "/timing/laps" },
    stints: { schemas: ["rtc.stints"], required: false, default: "/timing/stints" },
    pits: { schemas: ["rtc.pit"], required: false, default: "/timing/pit" },
  },
  defaultConfig: { columns: DEFAULT_COLUMNS, sort: null, scope: "session", gapMode: "auto", gapTo: "auto", group: "auto", showHidden: false },
  menu: ({ id, panel }) => {
    const c = panel.config;
    const set = (k: string) => (v: unknown) => patch(id, { [k]: v });
    const classes = classesOf(useWB.getState().derived?.entities ?? []);
    return [
      {
        label: "Columns",
        submenu: () => {
          const derived = useWB.getState().derived;
          return columnChooser(id, derived ? sectorCount(derived.lapsByEntity.values()) : 0, {});
        },
      },
      radio("Gaps", [
        { value: "auto", label: "Auto (by session type)" },
        { value: "best", label: "By best lap" },
        { value: "race", label: "By elapsed time" },
      ], c.gapMode ?? "auto", set("gapMode")),
      radio("Gap to", [
        { value: "auto", label: classes.length ? "Class leader" : "Leader" },
        { value: "leader", label: "Overall leader" },
        ...(classes.length ? [{ value: "class", label: "Class leader" }] : []),
        { value: "reference", label: "Reference driver" },
      ], c.gapTo ?? "auto", set("gapTo")),
      radio("Bests from", [
        { value: "session", label: "Whole session" },
        { value: "part", label: "Current session part" },
      ], c.scope ?? "session", set("scope")),
      ...(classes.length ? [radio("Classes", [{ value: "auto", label: "Grouped" }, { value: "none", label: "Overall" }], c.group ?? "auto", set("group"))] : []),
      check("Show hidden drivers", c.showHidden === true, set("showHidden")),
    ];
  },
  Component: TimingTable,
};

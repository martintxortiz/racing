"use client";

import { useMemo } from "react";

import { gridMetrics, lapGrid, orderAt, type GridCell } from "@/lib/workbench/analysis";
import { fmtLap, fmtSector, fmtSigned } from "@/lib/workbench/format";
import { slotOf } from "@/lib/workbench/selection";
import { teamCell } from "../colors";
import { cfg, check, entityMenuItems, openPanelMenu, patch, radio } from "../menus";
import { focusEntity, setT, toggleCompare, useWB, type MenuItem } from "../state";
import { Empty, Readout, Skeleton, useThrottledT, usePanelEntities, useTopicState, type PanelDef, type PanelProps } from "./common";

const LAPS = "/timing/laps";

/** Lap history: one row per lap, one column per car, fills for field and personal bests. */
function LapGrid({ id, panel }: PanelProps) {
  const derived = useWB((s) => s.derived);
  const store = useWB((s) => s.store);
  const session = useWB((s) => s.session);
  const sel = useWB((s) => s.sel);
  const shown = usePanelEntities(panel.config, "field");
  const t = useThrottledT(1);
  const state = useTopicState(panel.bindings.laps ?? LAPS);
  const metricKey = String(panel.config.metric ?? "lap");
  const newest = panel.config.newest !== false;
  const delta = panel.config.values === "delta";

  const metrics = useMemo(() => (derived ? gridMetrics(derived.laps) : []), [derived]);
  const metric = (metrics.find((m) => m.value === metricKey) ?? metrics[0])?.metric;
  const ids = useMemo(
    () => (derived ? orderAt(derived.lapsByEntity, shown, store.get("/timing/classification"), t, session?.kind === "race" ? "race" : "best") : []),
    [derived, shown, store, t, session?.kind],
  );
  const grid = useMemo(() => (derived && metric ? lapGrid(derived.lapsByEntity, ids, metric, t) : null), [derived, ids, metric, t]);

  if (state === "loading" && !derived?.laps.length) return <Skeleton rows={10} />;
  if (!grid || !metric || !grid.laps) return <Empty title="No laps yet">Laps appear here as cars finish them.</Empty>;

  const speed = metric.kind === "speed";
  const fmt = (v: number | null) => {
    if (v === null) return "";
    if (delta && grid.field !== null) return v === grid.field ? (speed ? String(Math.round(v)) : metric.kind === "lap" ? fmtLap(v) : fmtSector(v)) : speed ? String(Math.round(v - grid.field)) : fmtSigned(v - grid.field);
    return speed ? String(Math.round(v)) : metric.kind === "lap" ? fmtLap(v) : fmtSector(v);
  };
  const fill = (c: GridCell | undefined) =>
    !c ? undefined : c.flag === "purple" ? "wb-fill--purple" : c.flag === "green" ? "wb-fill--green" : c.kind === "deleted" ? "wb-fill--deleted" : c.kind ? "wb-grid__pit" : undefined;
  const lapNums = Array.from({ length: grid.laps }, (_, i) => i + 1);
  if (newest) lapNums.reverse();
  const label = metrics.find((m) => m.value === metricKey)?.label ?? "Lap time";

  return (
    <>
      <Readout>
        <span className="pw-faint">
          {label}
          {grid.field !== null ? ` · best ${fmt(grid.field)}` : ""}
        </span>
      </Readout>
      <div className="wb-scroll">
        <table className="pw-table wb-grid">
          <thead>
            <tr>
              <th className="is-num wb-grid__lap">Lap</th>
              {ids.map((e) => {
                const ent = derived?.entityById.get(e);
                const tc = teamCell(ent?.colour);
                const slot = slotOf(sel, e);
                return (
                  <th
                    key={e}
                    className={`${tc.className} is-center${slot >= 0 ? " is-selected" : ""}`}
                    style={tc.style}
                    title={ent?.name}
                    onClick={(ev) => (ev.shiftKey || ev.metaKey || ev.ctrlKey ? toggleCompare(e) : focusEntity(e))}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      openPanelMenu(id, ev.clientX, ev.clientY, () => entityMenuItems(e));
                    }}
                  >
                    {ent?.code ?? e}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lapNums.map((n) => (
              <tr key={n}>
                <td className="is-num wb-grid__lap">{n}</td>
                {ids.map((e) => {
                  const c = grid.cells.get(e)?.get(n);
                  return (
                    <td
                      key={e}
                      className={["is-num", fill(c), slotOf(sel, e) >= 0 && "is-cmp"].filter(Boolean).join(" ")}
                      title={c ? [c.value !== null ? fmt(c.value) : "", c.kind === "out" ? "Out lap" : c.kind === "in" ? "In lap" : c.kind === "deleted" ? `Deleted${c.lap.deletedReason ? `: ${c.lap.deletedReason}` : ""}` : "", c.lap.segment ?? ""].filter(Boolean).join(" · ") || undefined : undefined}
                      onClick={() => c?.lap.t1 != null && setT(c.lap.t1)}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openPanelMenu(id, ev.clientX, ev.clientY, () => [
                          ...(c?.lap.t1 != null ? [{ label: "Move cursor to lap end", onSelect: () => setT(c.lap.t1!) }] : []),
                          ...entityMenuItems(e, { lapNumber: n }),
                        ]);
                      }}
                    >
                      {c?.kind === "deleted" ? (
                        <s>{fmt(c.value)}</s>
                      ) : (c?.kind === "out" || c?.kind === "in") && !c.flag ? (
                        <span className="wb-grid__tag">{c.kind === "out" ? "OUT" : "IN"}</span>
                      ) : (
                        fmt(c?.value ?? null)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function gridMenu(id: string): MenuItem[] {
  const laps = useWB.getState().derived?.laps ?? [];
  const metrics = gridMetrics(laps);
  return [
    radio("Show", metrics.map((m) => ({ value: m.value, label: m.label })), cfg<string>(id, "metric", "lap"), (v) => patch(id, { metric: v })),
    radio("Values", [{ value: "time", label: "Absolute" }, { value: "delta", label: "Delta to field best" }], cfg<string>(id, "values", "time"), (v) => patch(id, { values: v })),
    check("Newest lap on top", cfg<boolean>(id, "newest", true), (v) => patch(id, { newest: v })),
  ];
}

export const lapHistory: PanelDef = {
  type: "lap-grid",
  title: "Lap history",
  description: "Every lap of every car in a grid: lap time, a sector or a speed trap, with field and personal bests filled.",
  icon: "grid",
  primary: "laps",
  entities: "field",
  needs: [LAPS],
  slots: { laps: { schemas: ["rtc.laps"], required: true, default: LAPS } },
  defaultConfig: { drivers: "field", metric: "lap", values: "time", newest: true },
  menu: ({ id }) => gridMenu(id),
  Component: LapGrid,
};

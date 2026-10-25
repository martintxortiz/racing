"use client";

import { useMemo, useState } from "react";

import { timingAt, type CellFlag, type TimingRow } from "@/lib/workbench/derive";
import { fmtLap, fmtSector, fmtSigned } from "@/lib/workbench/format";
import { resolveBinding } from "@/lib/workbench/layout";
import { useEntityStyles } from "../colors";
import { openMenu, setA, setB, swapAB, useWB } from "../state";
import { Empty, Readout, Skeleton, useThrottledT, useTopicState, type PanelDef, type PanelProps } from "./common";

const COLS: Record<string, { label: string; num?: boolean; width: number }> = {
  pos: { label: "Pos", num: true, width: 26 },
  driver: { label: "Driver", width: 58 },
  tyre: { label: "Tyre", width: 40 },
  best: { label: "Best", num: true, width: 60 },
  gap: { label: "Gap", num: true, width: 50 },
  s1: { label: "S1", num: true, width: 48 },
  s2: { label: "S2", num: true, width: 48 },
  s3: { label: "S3", num: true, width: 48 },
  last: { label: "Last", num: true, width: 58 },
  laps: { label: "Laps", num: true, width: 30 },
};

const flagClass = (f: CellFlag) => (f === "purple" ? "pw-c-purple" : f === "green" ? "pw-c-pb" : undefined);
const HINT_KEY = "wb/hint-ab-dismissed";

export function rowMenu(entity: string, x: number, y: number, extra: { label: string; onSelect: () => void }[] = []) {
  const { b, derived } = useWB.getState();
  const code = derived?.entityById.get(entity)?.code ?? entity;
  openMenu(x, y, [
    { heading: code },
    { label: "Set as A", hint: "Click", onSelect: () => setA(entity) },
    { label: "Set as B", hint: "Shift+click", onSelect: () => setB(entity) },
    { label: "Swap A/B", hint: "X", onSelect: swapAB },
    { label: "Clear B", onSelect: () => setB(null), disabled: b === null },
    ...extra,
  ]);
}

function TimingTable({ panel }: PanelProps) {
  const derived = useWB((s) => s.derived);
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  const a = useWB((s) => s.a);
  const b = useWB((s) => s.b);
  const hover = useWB((s) => s.hoverEntity);
  const t = useThrottledT(10);
  const styles = useEntityStyles();
  const [hint, setHint] = useState(() => typeof localStorage === "undefined" || !localStorage.getItem(HINT_KEY));
  const orderTopic = resolveBinding(panel.bindings.order ?? "/timing/classification", { a, b });
  const lapsTopic = panel.bindings.laps ?? "/timing/laps";
  const state = useTopicState(lapsTopic);
  const columns = ((panel.config.columns as string[]) ?? Object.keys(COLS)).filter((c) => COLS[c]);

  const rows = useMemo(() => {
    if (!derived) return [];
    return timingAt(
      {
        entities: derived.entities.map((e) => e.id),
        laps: derived.lapsByEntity,
        segments: derived.segments,
        classification: orderTopic ? store.get(orderTopic) : undefined,
        stints: store.get(panel.bindings.stints ?? "/timing/stints")?.rows,
      },
      t,
    );
    // version: the store is mutable and grows while loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, version, t, orderTopic, panel.bindings.stints]);

  const select = (e: React.MouseEvent, entity: string) => {
    if (e.shiftKey) setB(entity);
    else setA(entity);
    if (hint) {
      localStorage.setItem(HINT_KEY, "1");
      setHint(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    const i = rows.findIndex((r) => r.entity === a);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) setA(next.entity);
  };

  if (state === "loading" || (!derived && state !== "missing")) return <Skeleton rows={10} />;
  if (state === "missing" || !derived) return <Empty title="No timing topic bound">Bind a laps topic from the header.</Empty>;

  const cell = (r: TimingRow, c: string) => {
    switch (c) {
      case "pos":
        return r.eliminatedIn ? <span className="pw-faint">{r.pos ?? ""}</span> : (r.pos ?? "");
      case "driver": {
        const e = derived.entityById.get(r.entity);
        const st = styles.get(r.entity);
        return (
          <span className="wb-driver">
            <i className="pw-team" style={{ ["--c" as string]: st?.colour }} />
            <b title={`${e?.name ?? ""} #${e?.number ?? r.entity}${e?.team ? ` · ${e.team}` : ""}`}>{e?.code ?? r.entity}</b>
          </span>
        );
      }
      case "tyre":
        return r.tyre ? (
          <span className="wb-tyre">
            <span className={`pw-tyre pw-tyre--${tyreClass(r.tyre.compound)}`}>{r.tyre.compound[0]}</span>
            <span className="pw-tyre-age">{r.tyre.age}</span>
          </span>
        ) : (
          <span className="pw-faint">—</span>
        );
      case "best":
        return <span className={flagClass(r.bestFlag)}>{fmtLap(r.best?.time)}</span>;
      case "gap":
        return r.gap === null ? "" : r.gap === 0 ? <span className="pw-faint">—</span> : fmtSigned(r.gap);
      case "s1":
      case "s2":
      case "s3": {
        const i = Number(c[1]) - 1;
        return <span className={flagClass(r.sectorFlags[i])}>{fmtSector(r.sectors[i])}</span>;
      }
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
    }
  };

  // Rows with "Eliminated in Qn" separators before each eliminated group.
  const items: { row: TimingRow; group: string | null }[] = [];
  let group: string | null = null;
  for (const r of rows) {
    items.push({ row: r, group: r.eliminatedIn !== group && r.eliminatedIn ? r.eliminatedIn : null });
    group = r.eliminatedIn;
  }
  return (
    <>
      <Readout>
        <span className="pw-faint">{hint ? "Click = A · Shift+click = B" : `${rows.length} drivers`}</span>
      </Readout>
      <table className="pw-table wb-timing" tabIndex={0} onKeyDown={onKey}>
        <colgroup>
          {columns.map((c) => (
            <col key={c} style={{ width: COLS[c].width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className={COLS[c].num ? "is-num" : undefined}>
                {COLS[c].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.flatMap(({ row: r, group }) => {
            const out: React.ReactNode[] = [];
            if (group)
              out.push(
                <tr key={`g-${group}`} className="wb-timing__group">
                  <td colSpan={columns.length}>Eliminated in {group}</td>
                </tr>,
              );
            const role = r.entity === a ? "a" : r.entity === b ? "b" : "";
            out.push(
              <tr
                key={r.entity}
                className={[role && `is-${role}`, r.entity === hover && "is-hover"].filter(Boolean).join(" ")}
                onClick={(e) => select(e, r.entity)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  rowMenu(r.entity, e.clientX, e.clientY);
                }}
                onPointerEnter={() => useWB.setState({ hoverEntity: r.entity })}
                onPointerLeave={() => useWB.setState({ hoverEntity: null })}
              >
                {columns.map((c) => (
                  <td key={c} className={COLS[c].num ? "is-num" : undefined}>
                    {cell(r, c)}
                  </td>
                ))}
              </tr>,
            );
            return out;
          })}
        </tbody>
      </table>
    </>
  );
}

export function tyreClass(compound: string) {
  const c = compound.toUpperCase();
  if (c.startsWith("S")) return "soft";
  if (c.startsWith("M")) return "medium";
  if (c.startsWith("H")) return "hard";
  if (c.startsWith("I")) return "inter";
  if (c.startsWith("W")) return "wet";
  return "unknown";
}

export const timingTable: PanelDef = {
  type: "timing-table",
  title: "Timing",
  description: "Who is fastest at the cursor, by how much, on which tyre. Click = A, Shift+click = B.",
  icon: "data-table",
  primary: "laps",
  slots: {
    order: { schemas: ["rtc.classification"], required: false, default: "/timing/classification" },
    laps: { schemas: ["rtc.laps"], required: true, default: "/timing/laps" },
    stints: { schemas: ["rtc.stints"], required: false, default: "/timing/stints" },
    events: { schemas: ["rtc.events"], required: false, default: "/session/events" },
  },
  defaultConfig: { columns: Object.keys(COLS) },
  Component: TimingTable,
};

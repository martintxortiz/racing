"use client";

import { useEffect, useMemo, useRef } from "react";

import { segmentClock } from "@/lib/workbench/format";
import { slotOf } from "@/lib/workbench/selection";
import { usePalette } from "../colors";
import { cfg, check, entityMenuItems, openPanelMenu, patch } from "../menus";
import { focusEntity, setT, toggleCompare, useWB, type MenuItem } from "../state";
import { Empty, Readout, Skeleton, useThrottledT, useTopicState, type PanelDef, type PanelProps } from "./common";

interface Ev {
  i: number;
  t: number;
  category: string;
  flag: string | null;
  message: string;
  entity: string | null;
  raw: Record<string, unknown>;
}

const EVENTS = "/session/events";

function readEvents(topic: string): Ev[] {
  const d = useWB.getState().store.get(topic);
  if (!d) return [];
  return d.rows.map((r, i) => ({
    i,
    t: d.t[i],
    category: String(r.category ?? "Other"),
    flag: r.flag ? String(r.flag) : null,
    message: String(r.message ?? ""),
    entity: r.entity != null ? String(r.entity) : r.driver_number != null ? String(r.driver_number) : null,
    raw: r,
  }));
}

function EventLog({ id, panel }: PanelProps) {
  const p = usePalette();
  const topic = panel.bindings.events ?? EVENTS;
  const state = useTopicState(topic);
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  const derived = useWB((s) => s.derived);
  const session = useWB((s) => s.session);
  const sel = useWB((s) => s.sel);
  const t = useThrottledT(4);
  const follow = panel.config.follow !== false;
  const raw = panel.config.raw === true;
  const only = panel.config.only === true;
  const future = panel.config.future !== false;
  const hidden = useMemo(() => new Set((panel.config.categories as string[]) ?? []), [panel.config.categories]);
  const scroller = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => readEvents(topic), [store, version, topic]);
  const shown = events.filter(
    (e) => !hidden.has(e.category) && (!only || (e.entity !== null && sel.compare.includes(e.entity))) && (future || e.t <= t),
  );
  const past = shown.filter((e) => e.t <= t).length;

  // Follow: keep the latest event at or before the cursor in view.
  useEffect(() => {
    if (!follow || !scroller.current) return;
    const row = scroller.current.querySelector<HTMLElement>(`[data-row="${past - 1}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [past, follow]);

  if (state === "loading") return <Skeleton rows={8} />;
  if (state === "missing") return <Empty title="No messages">This recording has no {topic} topic.</Empty>;

  const known = (e: string | null) => (e ? derived?.entityById.get(e) : undefined);
  const code = (e: string | null) => (e ? (known(e)?.code ?? e) : "");

  return (
    <>
      <Readout>
        <span className="pw-faint">
          {past} of {shown.length}
          {hidden.size || only ? " · filtered" : ""}
        </span>
      </Readout>
      <div className="wb-log__rows" ref={scroller}>
        {shown.length === 0 ? <Empty title="No messages match">Right-click to change the filters.</Empty> : null}
        {shown.map((e, k) => {
          const slot = e.entity ? slotOf(sel, e.entity) : -1;
          return (
            <div
              key={e.i}
              data-row={k}
              className={`wb-log__row${e.t > t ? " is-future" : ""}${slot >= 0 ? " is-selected" : ""}`}
              onClick={(ev) => {
                setT(e.t);
                if (e.entity && known(e.entity)) {
                  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) toggleCompare(e.entity);
                }
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                openPanelMenu(id, ev.clientX, ev.clientY, () => [
                  { label: "Move cursor here", onSelect: () => setT(e.t) },
                  { label: "Copy message", onSelect: () => void navigator.clipboard?.writeText(e.message) },
                  { label: `Hide “${e.category}”`, onSelect: () => patch(id, { categories: [...hidden, e.category] }) },
                  ...(e.entity && known(e.entity) ? [{ separator: true } as const, ...entityMenuItems(e.entity)] : []),
                ]);
              }}
            >
              <span className="wb-log__t">{session && derived ? segmentClock(e.t, derived.segments, session.session) : e.t.toFixed(1)}</span>
              <span className="wb-log__flag" style={{ background: e.flag ? (p.flag[e.flag] ?? "transparent") : "transparent" }} title={e.flag ?? undefined} />
              <span
                className="wb-log__who"
                onClick={(ev) => {
                  if (!e.entity || !known(e.entity) || ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
                  focusEntity(e.entity);
                }}
              >
                {slot >= 0 ? <span className="wb-dot" style={{ background: p.series[slot % p.series.length] }} /> : null}
                {code(e.entity)}
              </span>
              {raw ? <code className="wb-log__raw">{JSON.stringify(e.raw)}</code> : <span className="wb-log__msg">{e.message}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function logMenu(id: string, topic: string): MenuItem[] {
  const cats = [...new Set(readEvents(topic).map((e) => e.category))].sort();
  return [
    {
      label: "Categories",
      disabled: !cats.length,
      submenu: () => {
        const hidden = cfg<string[]>(id, "categories", []);
        return [
          { label: "Show all", disabled: !hidden.length, onSelect: () => patch(id, { categories: [] }) },
          { separator: true },
          ...cats.map((c) => ({
            label: c,
            checked: !hidden.includes(c),
            keepOpen: true,
            onSelect: () => {
              const h = cfg<string[]>(id, "categories", []);
              patch(id, { categories: h.includes(c) ? h.filter((x) => x !== c) : [...h, c] });
            },
          })),
        ];
      },
    },
    check("Only compared drivers", cfg<boolean>(id, "only", false), (v) => patch(id, { only: v })),
    check("Show messages after cursor", cfg<boolean>(id, "future", true), (v) => patch(id, { future: v })),
    check("Follow cursor", cfg<boolean>(id, "follow", true), (v) => patch(id, { follow: v })),
    check("Raw rows", cfg<boolean>(id, "raw", false), (v) => patch(id, { raw: v })),
  ];
}

export const eventLog: PanelDef = {
  type: "event-log",
  title: "Race control",
  description: "Messages, flags and penalties in time order. Click to move the cursor there.",
  icon: "list",
  primary: "events",
  needs: [EVENTS],
  slots: { events: { schemas: ["rtc.events"], required: true, default: EVENTS } },
  defaultConfig: { follow: true, raw: false, categories: [], only: false, future: true },
  menu: ({ id, panel }) => logMenu(id, panel.bindings.events ?? EVENTS),
  Component: EventLog,
};

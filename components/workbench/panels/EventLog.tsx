"use client";

import { useEffect, useMemo, useRef } from "react";

import { segmentClock } from "@/lib/workbench/format";
import { usePalette } from "../colors";
import { openMenu, setA, setB, setT, useWB } from "../state";
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

function EventLog({ panel, setConfig }: PanelProps) {
  const p = usePalette();
  const topic = panel.bindings.events ?? "/session/events";
  const state = useTopicState(topic);
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  const derived = useWB((s) => s.derived);
  const session = useWB((s) => s.session);
  const a = useWB((s) => s.a);
  const b = useWB((s) => s.b);
  const t = useThrottledT(4);
  const follow = panel.config.follow !== false;
  const raw = panel.config.raw === true;
  const abOnly = panel.config.abOnly === true;
  const hidden = new Set((panel.config.categories as string[]) ?? []);
  const scroller = useRef<HTMLDivElement>(null);

  const events = useMemo<Ev[]>(() => {
    const d = store.get(topic);
    if (!d) return [];
    return d.rows.map((r, i) => ({
      i,
      t: d.t[i],
      category: String(r.category ?? "Other"),
      flag: r.flag ? String(r.flag) : null,
      message: String(r.message ?? ""),
      entity: r.entity != null ? String(r.entity) : null,
      raw: r,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, topic]);
  const categories = useMemo(() => [...new Set(events.map((e) => e.category))].sort(), [events]);
  const shown = events.filter((e) => !hidden.has(e.category) && (!abOnly || (e.entity !== null && (e.entity === a || e.entity === b))));
  const past = shown.filter((e) => e.t <= t).length;

  // Follow: keep the latest event at or before the cursor in view.
  useEffect(() => {
    if (!follow || !scroller.current) return;
    const row = scroller.current.querySelector<HTMLElement>(`[data-row="${past - 1}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [past, follow]);

  if (state === "loading") return <Skeleton rows={8} />;
  if (state === "missing") return <Empty title="No events topic">Bind /session/events from the header.</Empty>;

  const code = (e: string | null) => (e ? (derived?.entityById.get(e)?.code ?? e) : "");
  const toggle = (c: string) =>
    setConfig({ categories: hidden.has(c) ? [...hidden].filter((x) => x !== c) : [...hidden, c] });

  return (
    <>
      <Readout>
        <span className="pw-faint">
          {past}/{shown.length}
        </span>
      </Readout>
      <div className="wb-log">
        <div className="wb-log__bar">
          {categories.map((c) => (
            <button key={c} type="button" className="wb-textbtn" aria-pressed={!hidden.has(c)} onClick={() => toggle(c)}>
              {c}
            </button>
          ))}
          <span className="wb-log__spacer" />
          <button type="button" className="wb-textbtn" aria-pressed={abOnly} onClick={() => setConfig({ abOnly: !abOnly })}>
            A/B only
          </button>
          <button type="button" className="wb-textbtn" aria-pressed={follow} onClick={() => setConfig({ follow: !follow })}>
            Follow
          </button>
          <button type="button" className="wb-textbtn" aria-pressed={raw} onClick={() => setConfig({ raw: !raw })}>
            Raw
          </button>
        </div>
        <div className="wb-log__rows" ref={scroller}>
          {shown.length === 0 ? <Empty title="No events match" /> : null}
          {shown.map((e, k) => (
            <div
              key={e.i}
              data-row={k}
              className={`wb-log__row${e.t > t ? " is-future" : ""}${e.entity && (e.entity === a || e.entity === b) ? ` is-${e.entity === a ? "a" : "b"}` : ""}`}
              onClick={() => setT(e.t)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                openMenu(ev.clientX, ev.clientY, [
                  { label: "Move cursor here", onSelect: () => setT(e.t) },
                  ...(e.entity
                    ? [
                        { label: `Set ${code(e.entity)} as A`, onSelect: () => setA(e.entity) },
                        { label: `Set ${code(e.entity)} as B`, onSelect: () => setB(e.entity) },
                      ]
                    : []),
                  { label: "Copy message", onSelect: () => void navigator.clipboard?.writeText(e.message) },
                  { separator: true },
                  { label: `Hide ${e.category}`, onSelect: () => toggle(e.category) },
                ]);
              }}
            >
              <span className="wb-log__t">{session && derived ? segmentClock(e.t, derived.segments, session.session) : e.t.toFixed(1)}</span>
              <span className="wb-log__flag" style={{ background: e.flag ? (p.flag[e.flag] ?? "transparent") : "transparent" }} title={e.flag ?? undefined} />
              <span className="wb-log__who">{code(e.entity)}</span>
              {raw ? <code className="wb-log__raw">{JSON.stringify(e.raw)}</code> : <span className="wb-log__msg">{e.message}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export const eventLog: PanelDef = {
  type: "event-log",
  title: "Event log",
  description: "Race control messages in time order. Click a row to move the cursor there.",
  icon: "list",
  primary: "events",
  slots: { events: { schemas: ["rtc.events"], required: true, default: "/session/events" } },
  defaultConfig: { follow: true, raw: false, categories: [] },
  Component: EventLog,
};

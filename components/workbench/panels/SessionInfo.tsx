"use client";

import { useMemo } from "react";

import { trackStatusAt } from "@/lib/workbench/analysis";
import { classesOf } from "@/lib/workbench/derive";
import { fmtClock, segmentClock, timeOfDay } from "@/lib/workbench/format";
import { usePalette } from "../colors";
import { cfg, patch } from "../menus";
import { useWB, type MenuItem } from "../state";
import { Empty, useThrottledT, type PanelDef, type PanelProps } from "./common";

const ROWS = [
  { key: "session", label: "Session" },
  { key: "clock", label: "Clock" },
  { key: "remaining", label: "Remaining" },
  { key: "tod", label: "Local time" },
  { key: "status", label: "Track" },
  { key: "laps", label: "Laps" },
  { key: "field", label: "Field" },
  { key: "source", label: "Source" },
] as const;

const KIND: Record<string, string> = { practice: "Practice", qualifying: "Qualifying", race: "Race", test: "Test" };

function SessionInfo({ panel }: PanelProps) {
  const p = usePalette();
  const session = useWB((s) => s.session);
  const derived = useWB((s) => s.derived);
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  const t = useThrottledT(4);
  const hidden = new Set((panel.config.hide as string[]) ?? []);
  const events = useMemo(() => store.get(panel.bindings.events ?? "/session/events"), [store, version, panel.bindings.events]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !derived) return <Empty title="No session" />;
  const status = trackStatusAt(events, t);
  let leaderLaps = 0;
  for (const ls of derived.lapsByEntity.values()) for (const l of ls) if (l.t1 !== null && l.t1 <= t) leaderLaps = Math.max(leaderLaps, l.n);
  const totalLaps = Math.max(0, ...derived.laps.map((l) => l.n));
  const classes = classesOf(derived.entities);
  // Time left in the current part when the feed has parts, else in the session.
  const part = derived.segments.find((sg) => sg.t0 <= t && (sg.t1 === null || t <= sg.t1));
  const remaining = (part ? (part.t1 ?? session.session[1]) : session.session[1]) - t;
  const flag = status.flag ?? (t >= session.session[0] ? "GREEN" : null);

  const value = (key: (typeof ROWS)[number]["key"]): React.ReactNode => {
    switch (key) {
      case "session":
        return (
          <>
            <span className="pw-strong">{session.title || session.event}</span>
            <span className="pw-faint"> · {[session.series, KIND[session.kind], session.venue].filter(Boolean).join(" · ")}</span>
          </>
        );
      case "clock":
        return <span className="wb-kv__big">{segmentClock(t, derived.segments, session.session)}</span>;
      case "remaining":
        return remaining > 0 ? (
          <>
            {fmtClock(remaining, false)}
            {part && derived.segments.length > 1 ? <span className="pw-faint"> in {part.id}</span> : null}
          </>
        ) : t < session.session[0] ? (
          <span className="pw-faint">Not started</span>
        ) : part || t > session.session[1] ? (
          <span className="pw-faint">Finished</span>
        ) : (
          <span className="pw-faint">Between parts</span>
        );
      case "tod":
        return timeOfDay(t, session.startNs, session.utcOffsetSec);
      case "status":
        return flag ? (
          <span className="wb-status">
            <i className="wb-swatch" style={{ background: p.flag[flag] ?? p.flag[flag.split(" ")[0]] ?? p.text3 }} />
            <span>{flagLabel(flag)}</span>
            {status.sectors.length ? <span className="pw-faint"> · {status.sectors.map((s) => `S${s.sector} ${s.flag.toLowerCase()}`).join(", ")}</span> : null}
            {status.message && status.message.toUpperCase() !== flag ? (
              <span className="wb-status__msg pw-faint" title={status.message}>
                {status.message}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="pw-faint">No status yet</span>
        );
      case "laps":
        return totalLaps ? `${leaderLaps} of ${totalLaps}` : <span className="pw-faint">—</span>;
      case "field":
        return `${derived.entities.length} cars${classes.length ? ` · ${classes.join(", ")}` : ""}`;
      case "source":
        return (
          <span className="pw-faint">
            {session.adapter} · {session.topics.length} topics
          </span>
        );
    }
  };

  return (
    <dl className="wb-kv">
      {ROWS.filter((r) => !hidden.has(r.key)).map((r) => (
        <div key={r.key} className="wb-kv__row">
          <dt>{r.label}</dt>
          <dd>{value(r.key)}</dd>
        </div>
      ))}
    </dl>
  );
}

function flagLabel(f: string) {
  const map: Record<string, string> = { SC: "Safety car", VSC: "Virtual safety car", FCY: "Full course yellow", GREEN: "Green", RED: "Red flag", CHEQUERED: "Chequered" };
  return map[f] ?? f.charAt(0) + f.slice(1).toLowerCase();
}

function infoMenu(id: string): MenuItem[] {
  return [
    {
      label: "Rows",
      submenu: () => {
        const hide = cfg<string[]>(id, "hide", []);
        return ROWS.map((r) => ({
          label: r.label,
          checked: !hide.includes(r.key),
          keepOpen: true,
          onSelect: () => {
            const h = cfg<string[]>(id, "hide", []);
            patch(id, { hide: h.includes(r.key) ? h.filter((x) => x !== r.key) : [...h, r.key] });
          },
        }));
      },
    },
  ];
}

export const sessionInfo: PanelDef = {
  type: "session-info",
  title: "Session",
  description: "Session name, part clock, time remaining, local time, track status and lap count.",
  icon: "time",
  primary: "info",
  slots: {
    info: { schemas: ["rtc.session_info"], required: false, default: "/session/info" },
    events: { schemas: ["rtc.events"], required: false, default: "/session/events" },
    laps: { schemas: ["rtc.laps"], required: false, default: "/timing/laps" },
  },
  defaultConfig: { hide: [] },
  menu: ({ id }) => infoMenu(id),
  Component: SessionInfo,
};

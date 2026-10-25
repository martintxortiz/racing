"use client";
import { useMemo } from "react";
import { sentenceCase } from "@/data/text";
import type { RcEvent } from "@/derive/model";
import { sep, type MenuItem } from "@/menus/types";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { timeOfDay } from "@/ui/clock";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { Pill, type Tone } from "./cells";
import { useT } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import tcss from "./table.module.css";
import css from "./events.module.css";

export type EventKind = "flags" | "blue" | "sc" | "session" | "notes";

export interface EventsConfig {
  hide?: EventKind[];
  onlySelected?: boolean;
  follow?: boolean;
  /** Show race control text exactly as sent (all caps). */
  raw?: boolean;
  /** Wrap long messages instead of one line with an ellipsis. */
  wrap?: boolean;
  /** Fixed columns: lap and/or time, type, and the message wrapping. */
  dense?: boolean;
}

const KIND_LABEL: Record<EventKind, string> = {
  flags: "Flags",
  blue: "Blue flags",
  sc: "Safety car",
  session: "Session status",
  notes: "Notes and penalties",
};

export function eventKind(e: RcEvent): EventKind {
  if (e.flag === "BLUE") return "blue";
  if (e.category === "SafetyCar") return "sc";
  if (e.category === "SessionStatus") return "session";
  if (e.flag) return "flags";
  return "notes";
}

/** Type of a message as a pill: flags in their colour, everything else in a tinted tone. */
export function eventType(e: RcEvent): { label: string; tone: Tone } {
  const sector = e.scope?.toUpperCase() === "SECTOR" && e.sector != null ? ` S${e.sector}` : "";
  switch (e.flag) {
    case "GREEN":
      return { label: "Green", tone: "good" };
    case "YELLOW":
      return { label: `Yellow${sector}`, tone: "flagYellow" };
    case "DOUBLE YELLOW":
      return { label: `Double yellow${sector}`, tone: "flagYellow" };
    case "RED":
      return { label: "Red", tone: "flagRed" };
    case "BLUE":
      return { label: "Blue", tone: "info" };
    case "CHEQUERED":
      return { label: "Chequered", tone: "chequered" };
    case "CLEAR":
      return { label: `Clear${sector}`, tone: "good" };
    case "BLACK AND WHITE":
      return { label: "Black/white", tone: "neutral" };
    case "BLACK":
      return { label: "Black", tone: "chequered" };
  }
  if (e.category === "SafetyCar") return { label: /VIRTUAL|VSC/i.test(e.message) ? "VSC" : "Safety car", tone: "flagYellow" };
  if (e.category === "SessionStatus") return { label: "Session", tone: "neutral" };
  const m = e.message.toUpperCase();
  if (/PENALTY|REPRIMAND|DISQUALIF/.test(m) && !/NO FURTHER|NO PENALTY/.test(m)) return { label: "Penalty", tone: "bad" };
  if (/INVESTIGAT|NOTED|UNDER REVIEW|SUMMONED/.test(m)) return { label: "Investigation", tone: "warn" };
  if (/DELETED|TRACK LIMITS/.test(m)) return { label: "Track limits", tone: "neutral" };
  if (/DRS/.test(m) || e.category === "Drs") return { label: "DRS", tone: "info" };
  return { label: "Info", tone: "neutral" };
}

function EventLog({ session, config, setConfig, width }: WidgetProps<EventsConfig>) {
  const t = useT(4);
  const panel = usePanel();
  const clock = useApp((s) => s.settings.clock);
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const hide = useMemo(() => new Set<EventKind>(config.hide ?? ["blue"]), [config.hide]);
  const follow = config.follow !== false;
  const race = session.kind === "race";
  const dense = !!config.dense;
  // In a race the lap says when; the time of day joins it once the panel has room.
  const showTime = !dense || !race || width >= 520;

  const list = useMemo(() => {
    const out = session.events.filter((e) => {
      if (hide.has(eventKind(e))) return false;
      if (config.onlySelected && e.entity !== focus && e.entity !== compare) return false;
      return true;
    });
    return out.reverse();
  }, [session.events, hide, config.onlySelected, focus, compare]);
  const shown = follow ? list.filter((e) => e.t <= t) : list;

  const filterMenu = (): MenuItem[] => [
    ...(Object.keys(KIND_LABEL) as EventKind[]).map((k) => ({
      id: `k:${k}`,
      label: KIND_LABEL[k],
      checked: !hide.has(k),
      run: () => {
        const h = new Set(hide);
        if (h.has(k)) h.delete(k);
        else h.add(k);
        setConfig({ hide: [...h] });
      },
    })),
    sep,
    { id: "sel", label: "Only A and B", checked: !!config.onlySelected, disabled: !focus && !compare, run: () => setConfig({ onlySelected: !config.onlySelected }) },
    { id: "follow", label: "Hide messages after the replay time", checked: follow, run: () => setConfig({ follow: !follow }) },
    { id: "wrap", label: "Wrap long messages", checked: !!config.wrap, run: () => setConfig({ wrap: !config.wrap }) },
    { id: "raw", label: "Original capitals", checked: !!config.raw, run: () => setConfig({ raw: !config.raw }) },
    { id: "dense", label: "Fixed columns", checked: dense, run: () => setConfig({ dense: !dense }) },
  ];

  const rowMenu = (e: React.MouseEvent, ev: RcEvent) => {
    const ent = ev.entity ? session.entityById.get(ev.entity) : null;
    const k = eventKind(ev);
    openMenu(e, [
      { id: "jump", label: "Jump to this message", hint: timeOfDay(session, ev.t, clock).text, run: () => useCursor.getState().setT(ev.t) },
      { id: "copy", label: "Copy message", run: () => navigator.clipboard?.writeText(ev.message) },
      ...(ent
        ? [sep, { id: "focus", label: `Focus ${ent.code}`, swatch: ent.colour, run: () => useApp.getState().setFocus(ent.id) }, { id: "cmp", label: `Compare ${ent.code}`, swatch: ent.colour, run: () => useApp.getState().setCompare(ent.id) }]
        : []),
      sep,
      { id: "hidek", label: `Hide ${KIND_LABEL[k].toLowerCase()}`, run: () => setConfig({ hide: [...hide, k] }) },
      { kind: "sub", id: "filter", label: "Show", items: filterMenu() },
      sep,
      { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
    ]);
  };

  return (
    <div className={css.wrap} onContextMenu={(e) => openMenu(e, [...filterMenu(), sep, { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Event log")}>
      <HeaderSlot>
        <span>
          {shown.length} of {session.events.length}
          {hide.size ? `, ${[...hide].map((k) => KIND_LABEL[k].toLowerCase()).join(", ")} hidden` : ""}
        </span>
      </HeaderSlot>
      <table className={`${tcss.table} ${dense ? css.dense : ""}`} data-testid="event-log">
        {dense && (
          <colgroup>
            {showTime && <col style={{ width: 66 }} />}
            {race && <col style={{ width: 36 }} />}
            <col style={{ width: 112 }} />
            <col />
          </colgroup>
        )}
        <thead>
          <tr>
            {showTime && <th className={tcss.l}>Time</th>}
            {race && <th>Lap</th>}
            <th className={tcss.l}>Type</th>
            <th className={tcss.l}>Message</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((ev, i) => {
            const ty = eventType(ev);
            return (
              <tr key={`${ev.t}-${i}`} className={!follow && ev.t > t ? css.future : ""} onClick={() => useCursor.getState().setT(ev.t)} onContextMenu={(e) => rowMenu(e, ev)}>
                {showTime && (
                  <td className={`${tcss.l} ${css.time} num`}>
                    <Pill>{timeOfDay(session, ev.t, clock).text}</Pill>
                  </td>
                )}
                {race && (
                  <td className="num">
                    <Pill muted={ev.lap == null}>{ev.lap ?? "\u2014"}</Pill>
                  </td>
                )}
                <td className={tcss.l} style={dense ? undefined : { width: "1%" }}>
                  <Pill tone={ty.tone} title={ty.label}>
                    {ty.label}
                  </Pill>
                </td>
                <td className={`${tcss.l} ${css.msg} ${config.wrap ? css.wrapMsg : ""}`} title={ev.message}>
                  {config.raw ? ev.message : sentenceCase(ev.message)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!shown.length && <div className={tcss.empty}>{session.events.length ? "No messages yet at this time" : "This file has no race control messages"}</div>}
    </div>
  );
}

export const eventsWidget: WidgetDef<EventsConfig> = {
  type: "events",
  name: "Event log",
  description: "Race control messages with flags, newest first; click to jump",
  group: "Session",
  unavailable: (s) => (s.events.length ? null : "This file has no race control topic."),
  Component: EventLog,
  menu: ({ config, setConfig }) => [
    { id: "follow", label: "Hide messages after the replay time", checked: config.follow !== false, run: () => setConfig({ follow: config.follow === false }) },
    { id: "blue", label: "Show blue flags", checked: !(config.hide ?? ["blue"]).includes("blue"), run: () => { const h = new Set<EventKind>(config.hide ?? ["blue"]); if (h.has("blue")) h.delete("blue"); else h.add("blue"); setConfig({ hide: [...h] }); } },
  ],
};

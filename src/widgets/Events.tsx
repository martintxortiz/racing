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

function flagStyle(e: RcEvent): { label: string; bg: string; fg: string; border?: string } | null {
  const f = e.flag;
  const sector = e.scope?.toUpperCase() === "SECTOR" && e.sector != null ? ` S${e.sector}` : "";
  switch (f) {
    case "GREEN":
      return { label: "Green", bg: "var(--flag-green)", fg: "#fff" };
    case "YELLOW":
      return { label: `Yellow${sector}`, bg: "var(--flag-yellow)", fg: "#15171a" };
    case "DOUBLE YELLOW":
      return { label: `Double yellow${sector}`, bg: "var(--flag-yellow)", fg: "#15171a" };
    case "RED":
      return { label: "Red", bg: "var(--flag-red)", fg: "#fff" };
    case "BLUE":
      return { label: "Blue", bg: "var(--flag-blue)", fg: "#fff" };
    case "CHEQUERED":
      return { label: "Chequered", bg: "var(--text)", fg: "var(--panel)" };
    case "CLEAR":
      return { label: `Clear${sector}`, bg: "var(--pb-bg)", fg: "var(--pb-fg)" };
    case "BLACK AND WHITE":
      return { label: "Black/white", bg: "linear-gradient(135deg, #15171a 50%, #fff 50%)", fg: "transparent", border: "1px solid var(--line-2)" };
    case "BLACK":
      return { label: "Black", bg: "#15171a", fg: "#fff" };
  }
  if (e.category === "SafetyCar") return { label: /VIRTUAL|VSC/i.test(e.message) ? "VSC" : "Safety car", bg: "var(--flag-sc)", fg: "#15171a" };
  if (e.category === "SessionStatus") return { label: "Session", bg: "var(--panel-2)", fg: "var(--text-2)", border: "1px solid var(--line-2)" };
  return null;
}

function EventLog({ session, config, setConfig }: WidgetProps<EventsConfig>) {
  const t = useT(4);
  const panel = usePanel();
  const clock = useApp((s) => s.settings.clock);
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const hide = useMemo(() => new Set<EventKind>(config.hide ?? ["blue"]), [config.hide]);
  const follow = config.follow !== false;
  const race = session.kind === "race";

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
      <table className={tcss.table}>
        <thead>
          <tr>
            <th className={tcss.l}>Time</th>
            {race && <th>Lap</th>}
            <th className={tcss.l}>Flag</th>
            <th className={tcss.l}>Message</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((ev, i) => {
            const fs = flagStyle(ev);
            return (
              <tr key={`${ev.t}-${i}`} className={!follow && ev.t > t ? css.future : ""} onClick={() => useCursor.getState().setT(ev.t)} onContextMenu={(e) => rowMenu(e, ev)}>
                <td className={`${tcss.l} ${css.time} num`}>{timeOfDay(session, ev.t, clock).text}</td>
                {race && <td className="num">{ev.lap ?? ""}</td>}
                <td className={tcss.l} style={{ width: "1%" }}>
                  {fs && (
                    <span className={css.flag} style={{ background: fs.bg, color: fs.fg, border: fs.border }} title={fs.label}>
                      {fs.label}
                    </span>
                  )}
                </td>
                <td className={`${tcss.l} ${css.msg} ${config.wrap ? css.wrapMsg : ""}`} title={ev.message}>{config.raw ? ev.message : sentenceCase(ev.message)}</td>
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

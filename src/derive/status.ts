import type { RcEvent } from "./model";

export type TrackState = "none" | "green" | "yellow" | "sc" | "vsc" | "red" | "chequered";

export interface TrackStatus {
  state: TrackState;
  label: string;
  /** Sectors (marshal sectors) currently under yellow or double yellow. */
  yellows: { sector: number; double: boolean }[];
  /** Safety car is ending this lap. */
  ending: boolean;
  since: number;
  running: boolean;
}

const LABELS: Record<TrackState, string> = {
  none: "No session",
  green: "Track clear",
  yellow: "Yellow flag",
  sc: "Safety car",
  vsc: "Virtual safety car",
  red: "Red flag",
  chequered: "Chequered flag",
};

/** Track status at time t by replaying race control messages. */
export function trackStatusAt(events: RcEvent[], t: number): TrackStatus {
  let base = "none" as TrackState;
  let since = 0;
  let running = false;
  let ending = false;
  let trackYellow = false;
  const yellows = new Map<number, boolean>();
  for (const e of events) {
    if (e.t > t) break;
    const m = e.message.toUpperCase();
    const set = (s: TrackState) => {
      if (base !== s) since = e.t;
      base = s;
    };
    if (/SESSION (STARTED|RESUMED)/.test(m)) {
      running = true;
      set("green");
      yellows.clear();
    } else if (/SESSION (FINISHED|ENDED|COMPLETE)/.test(m)) {
      running = false;
    } else if (/SESSION (ABORTED|SUSPENDED)/.test(m)) {
      set("red");
    }
    if (e.category === "SafetyCar" || /SAFETY CAR|\bVSC\b/.test(m)) {
      if (/VSC DEPLOYED|VIRTUAL SAFETY CAR DEPLOYED/.test(m)) {
        set("vsc");
        ending = false;
      } else if (/VSC ENDING|VIRTUAL SAFETY CAR ENDING/.test(m)) {
        ending = true;
      } else if (/SAFETY CAR DEPLOYED/.test(m)) {
        set("sc");
        ending = false;
      } else if (/SAFETY CAR IN THIS LAP|SAFETY CAR ENDING/.test(m)) {
        ending = true;
      }
    }
    const flag = e.flag?.toUpperCase() ?? null;
    if (!flag) continue;
    const scope = e.scope?.toUpperCase() ?? "TRACK";
    if (flag === "RED") set("red");
    else if (flag === "CHEQUERED") {
      set("chequered");
      ending = false;
    } else if (flag === "GREEN" && scope === "TRACK") {
      if (base === "red" || base === "sc" || base === "vsc" || base === "none" || base === "green") set("green");
      ending = false;
      trackYellow = false;
      yellows.clear();
    } else if (flag === "CLEAR") {
      if (scope === "SECTOR" && e.sector != null) yellows.delete(e.sector);
      else {
        yellows.clear();
        trackYellow = false;
        if (base === "sc" || base === "vsc") set("green");
        ending = false;
      }
    } else if (flag === "YELLOW" || flag === "DOUBLE YELLOW") {
      if (scope === "SECTOR" && e.sector != null) yellows.set(e.sector, flag === "DOUBLE YELLOW");
      else trackYellow = true;
    }
  }
  let state: TrackState = base;
  if (state === "green" && (trackYellow || yellows.size)) state = "yellow";
  const ys = [...yellows.entries()].map(([sector, double]) => ({ sector, double })).sort((a, b) => a.sector - b.sector);
  let label = LABELS[state];
  if (state === "yellow" && ys.some((y) => y.double)) label = "Double yellow";
  if ((state === "sc" || state === "vsc") && ending) label = state === "sc" ? "Safety car in this lap" : "VSC ending";
  if (state === "green" && !running) label = "Session not running";
  return { state, label, yellows: ys, ending, since, running };
}

export interface StatusSpan {
  t0: number;
  t1: number;
  state: TrackState;
}

/** Spans of SC, VSC, red and yellow for chart shading and the scrubber. */
export function statusSpans(events: RcEvent[], end: number): StatusSpan[] {
  const times = [...new Set(events.map((e) => e.t))].sort((a, b) => a - b);
  const spans: StatusSpan[] = [];
  let cur: StatusSpan | null = null;
  for (const t of times) {
    const st = trackStatusAt(events, t).state;
    if (!cur || cur.state !== st) {
      if (cur) cur.t1 = t;
      cur = { t0: t, t1: end, state: st };
      spans.push(cur);
    }
  }
  return spans.filter((s) => s.state === "sc" || s.state === "vsc" || s.state === "red" || s.state === "yellow");
}

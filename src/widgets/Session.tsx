"use client";
import { fmtClock, fmtLap, DASH } from "@/data/format";
import { indexAtOrBefore } from "@/derive/search";
import { segmentAt } from "@/derive/session";
import { trackStatusAt, type TrackState } from "@/derive/status";
import { useApp } from "@/state/app";
import { timeOfDay } from "@/ui/clock";
import { useT, useTiming } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./session.module.css";

const STATUS_STYLE: Record<TrackState, { bg: string; fg: string }> = {
  none: { bg: "var(--panel-2)", fg: "var(--text-2)" },
  green: { bg: "var(--flag-green)", fg: "#fff" },
  yellow: { bg: "var(--flag-yellow)", fg: "#15171a" },
  sc: { bg: "var(--flag-sc)", fg: "#15171a" },
  vsc: { bg: "var(--flag-sc)", fg: "#15171a" },
  red: { bg: "var(--flag-red)", fg: "#fff" },
  chequered: { bg: "var(--text)", fg: "var(--panel)" },
};

function SessionStatus({ session, width }: WidgetProps) {
  const t = useT(10);
  const clock = useApp((s) => s.settings.clock);
  const timing = useTiming(session, t);
  const segIdx = segmentAt(session.segments, t);
  const seg = session.segments[segIdx];
  const before = t < (session.segments[0]?.t0 ?? 0);
  const inSeg = seg && t >= seg.t0 && t <= seg.t1;
  const after = seg && t > seg.t1;
  const status = trackStatusAt(session.events, t);
  const st = STATUS_STYLE[status.state];
  const tod = timeOfDay(session, t, clock);
  const w = session.weather;
  const wi = w ? indexAtOrBefore(w.t, t) : -1;
  const wv = (prefix: string) => {
    const k = w ? Object.keys(w.values).find((x) => x.startsWith(prefix)) : undefined;
    return w && k && wi >= 0 ? w.values[k][wi] : NaN;
  };
  const yellowText = status.yellows.length ? `${status.yellows.some((y) => y.double) ? "Double yellow" : "Yellow"} in sector ${status.yellows.map((y) => y.sector).join(", ")}` : null;

  let phase = seg?.label ?? session.sessionName;
  if (before) phase = "Before start";
  else if (after && segIdx < session.segments.length - 1) phase = `${seg.label} finished`;
  else if (after) phase = "Finished";
  const elapsed = inSeg ? t - seg.t0 : after ? seg.t1 - seg.t0 : before ? (session.segments[0]?.t0 ?? 0) - t : 0;

  return (
    <div className={css.wrap}>
      <div className={css.block} style={{ minWidth: 168 }}>
        <span className={css.label}>
          {session.sessionName}
          {session.kind === "qualifying" && seg ? ` · ${phase}` : before ? " · starts in" : after ? " · finished" : ""}
        </span>
        <span className={css.clock}>{fmtClock(elapsed)}</span>
        <span className={`${css.sub} num`}>
          {tod.text} {tod.zone}
        </span>
      </div>
      <div className={css.status} style={{ background: st.bg, color: st.fg }} data-track-state={status.state}>
        <span className={css.statusMain}>{status.label}</span>
        <span className={css.statusSub}>{yellowText ?? (status.state === "none" ? "Waiting for session start" : status.since ? `since ${timeOfDay(session, status.since, clock, false).text}` : "")}</span>
      </div>
      {session.kind === "race" && (
        <div className={css.block}>
          <span className={css.label}>Lap</span>
          <span className={css.big}>
            {Math.min(timing.leaderLaps + (inSeg ? 1 : 0), session.totalLaps ?? Infinity) || DASH}
            <span style={{ color: "var(--text-3)", fontSize: 15 }}> / {session.totalLaps ?? DASH}</span>
          </span>
        </div>
      )}
      {session.kind !== "race" && width > 640 && (
        <div className={css.block}>
          <span className={css.label}>Session best</span>
          <span className={css.big} style={{ color: timing.bests.lap != null ? "var(--sb-fg)" : undefined }}>
            {fmtLap(timing.bests.lap)}
          </span>
          <span className={css.sub}>{timing.bests.lapRef ? session.entityById.get(timing.bests.lapRef.entity)?.name : DASH}</span>
        </div>
      )}
      <div className={css.grow} />
      {w && width > 520 && (
        <div className={css.block}>
          <div className={css.wx}>
            <span>Air</span>
            <span>{Number.isFinite(wv("air_temp")) ? `${wv("air_temp").toFixed(1)} °C` : DASH}</span>
            <span>Track</span>
            <span>{Number.isFinite(wv("track_temp")) ? `${wv("track_temp").toFixed(1)} °C` : DASH}</span>
            <span>Wind</span>
            <span>{Number.isFinite(wv("wind_speed")) ? `${wv("wind_speed").toFixed(1)} m/s` : DASH}</span>
            <span>Rain</span>
            <span>{wv("rainfall") > 0 ? "Yes" : Number.isFinite(wv("rainfall")) ? "No" : DASH}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const sessionWidget: WidgetDef = {
  type: "session",
  name: "Session",
  description: "Session clock, track status, lap count and weather",
  group: "Session",
  Component: SessionStatus,
};

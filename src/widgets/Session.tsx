"use client";
import { DASH, fmtClock } from "@/data/format";
import { indexAtOrBefore } from "@/derive/search";
import { segmentAt } from "@/derive/session";
import { trackStatusAt, type TrackState } from "@/derive/status";
import { useApp } from "@/state/app";
import { timeOfDay } from "@/ui/clock";
import { Pill, type Tone } from "./cells";
import { useT, useTiming } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./session.module.css";

const STATUS_TONE: Record<TrackState, Tone> = {
  none: "neutral",
  green: "good",
  yellow: "flagYellow",
  sc: "flagYellow",
  vsc: "flagYellow",
  red: "flagRed",
  chequered: "chequered",
};

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** Weather fields by name prefix, so any series that names them the usual way works. */
const WX: { key: string; label: string; fmt: (v: number) => string }[] = [
  { key: "air_temp", label: "Air", fmt: (v) => `${v.toFixed(1)} °C` },
  { key: "track_temp", label: "Track", fmt: (v) => `${v.toFixed(1)} °C` },
  { key: "humidity", label: "Humidity", fmt: (v) => `${v.toFixed(0)}%` },
  { key: "pressure", label: "Pressure", fmt: (v) => `${v.toFixed(0)} hPa` },
];

/** Track & weather: two compact lines. Event, clock, lap and track status; then the weather readings. */
function TrackWeather({ session, width }: WidgetProps) {
  const t = useT(4);
  const clock = useApp((s) => s.settings.clock);
  const timing = useTiming(session, t);
  const segIdx = segmentAt(session.segments, t);
  const seg = session.segments[segIdx];
  const before = t < (session.segments[0]?.t0 ?? 0);
  const inSeg = seg && t >= seg.t0 && t <= seg.t1;
  const after = seg && t > seg.t1;
  const status = trackStatusAt(session.events, t);
  const tod = timeOfDay(session, t, clock);
  const elapsed = inSeg ? t - seg.t0 : after ? seg.t1 - seg.t0 : 0;

  const w = session.weather;
  const wi = w ? indexAtOrBefore(w.t, t) : -1;
  const wv = (prefix: string) => {
    const k = w ? Object.keys(w.values).find((x) => x.startsWith(prefix)) : undefined;
    return w && k && wi >= 0 ? w.values[k][wi] : NaN;
  };
  const windS = wv("wind_speed");
  const windD = wv("wind_dir");
  const rain = wv("rainfall");

  const yellow = status.yellows.length ? `${status.yellows.some((y) => y.double) ? "Double yellow" : "Yellow"} S${status.yellows.map((y) => y.sector).join(", ")}` : null;
  const statusText = status.state === "none" ? (before ? "Not started" : status.label) : (yellow ?? status.label);

  let lapText: string | null = null;
  if (session.kind === "race") {
    const total = session.totalLaps;
    const lap = Math.min(timing.leaderLaps + (inSeg ? 1 : 0), total ?? Infinity);
    lapText = lap ? `Lap ${lap}${total ? `/${total}` : ""}${total && lap < total ? ` (${total - lap} left)` : ""}` : null;
  } else if (seg) {
    lapText = before ? "Before start" : after && segIdx === session.segments.length - 1 ? `${seg.label} finished` : seg.label !== session.sessionName ? seg.label : null;
  }

  return (
    <div className={css.wrap} data-testid="track-weather">
      <div className={css.line}>
        <span className={css.title} title={session.title}>
          {session.title || session.circuit} · {session.sessionName}
        </span>
        <span className={css.value} title={`${tod.text} ${tod.zone}`}>
          {before ? tod.text : fmtClock(elapsed)}
        </span>
        {lapText && <span className={css.value}>{lapText}</span>}
        <span className={css.grow} />
        <span data-track-state={status.state}>
          <Pill tone={STATUS_TONE[status.state]}>{statusText}</Pill>
        </span>
      </div>
      <div className={css.line}>
        {WX.filter((x) => width >= 540 || x.key !== "pressure").map((x) => {
          const v = wv(x.key);
          return (
            <span key={x.key} className={css.item}>
              <span className={css.label}>{x.label}</span>
              <span className={css.value}>{Number.isFinite(v) ? x.fmt(v) : DASH}</span>
            </span>
          );
        })}
        <span className={css.item}>
          <span className={css.label}>Wind</span>
          <span className={css.value}>
            {Number.isFinite(windS) ? `${windS.toFixed(1)} m/s` : DASH}
            {Number.isFinite(windD) ? ` ${compass(windD)}` : ""}
          </span>
        </span>
        <span className={css.grow} />
        {Number.isFinite(rain) && <Pill tone={rain > 0 ? "info" : "neutral"}>{rain > 0 ? "Wet" : "Dry"}</Pill>}
      </div>
    </div>
  );
}

export const sessionWidget: WidgetDef = {
  type: "session",
  name: "Track & weather",
  description: "Event, session clock, lap count, track status and weather on two lines",
  group: "Session",
  Component: TrackWeather,
};

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtClock } from "@/data/format";
import type { SessionModel } from "@/derive/model";
import { statusSpans } from "@/derive/status";
import { segmentAt } from "@/derive/session";
import { replayRange, useApp } from "@/state/app";
import { SPEEDS, useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { IconNext, IconPause, IconPlay, IconPrev } from "./icons";
import { timeOfDay } from "./clock";
import css from "./Transport.module.css";

/** Advance the cursor while playing. */
export function usePlayback() {
  const session = useApp((s) => s.session);
  const full = useApp((s) => s.settings.fullRecording);
  const playing = useCursor((s) => s.playing);
  const isLive = useApp((s) => !!s.live);
  useEffect(() => {
    if (!playing || !session) return;
    const rangeEnd = replayRange(session, full)[1];
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const c = useCursor.getState();
      const t = c.t + dt * c.speed;
      const live = useApp.getState().live;
      // Live: playback catches up with the newest data and then follows it.
      const end = live ? live.head : rangeEnd;
      if (t >= end) {
        c.setPlaying(false);
        if (live) useApp.getState().setFollowing(true);
        else c.setT(end);
        return;
      }
      c.setT(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, session, full, isLive]);
}

/** Lap boundaries of the focus entity (or every lap start) for stepping. */
export function lapBoundaries(s: SessionModel, focus: string | null): number[] {
  const laps = focus ? s.lapsByEntity.get(focus) ?? [] : [];
  if (laps.length) return [...new Set(laps.flatMap((l) => [l.t0, ...(l.t1 != null ? [l.t1] : [])]))].sort((a, b) => a - b);
  return s.segments.flatMap((g) => [g.t0, g.t1]).sort((a, b) => a - b);
}

export function stepLap(dir: 1 | -1) {
  const st = useApp.getState();
  const s = st.session;
  if (!s) return;
  const c = useCursor.getState();
  const b = lapBoundaries(s, st.focus);
  const t = c.t;
  const next = dir > 0 ? b.find((x) => x > t + 0.5) : [...b].reverse().find((x) => x < t - 0.5);
  if (next != null) c.setT(next);
}

const SPAN_COLOUR: Record<string, string> = { sc: "var(--flag-sc)", vsc: "var(--flag-sc)", red: "var(--flag-red)", yellow: "var(--flag-yellow)" };

export function Transport() {
  const session = useApp((s) => s.session)!;
  const full = useApp((s) => s.settings.fullRecording);
  const clock = useApp((s) => s.settings.clock);
  const t = useCursor((s) => s.t);
  const playing = useCursor((s) => s.playing);
  const speed = useCursor((s) => s.speed);
  const live = useApp((s) => s.live);
  const streamError = useApp((s) => s.streamError);
  const [lo, hi0] = replayRange(session, full);
  // Live: the bar always reaches the newest data.
  const hi = live ? Math.max(hi0, live.head) : hi0;
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const spans = useMemo(() => statusSpans(session.events, session.duration), [session]);

  const span = hi - lo || 1;
  const pct = (x: number) => `${Math.min(100, Math.max(0, ((x - lo) / span) * 100))}%`;
  const seg = session.segments[segmentAt(session.segments, t)];
  const inSeg = seg && t >= seg.t0 && t <= seg.t1 + 1;
  const tod = timeOfDay(session, t, clock);

  const tAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return lo + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span;
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    useCursor.getState().setT(tAt(e.clientX));
  };

  return (
    <footer className={css.bar} aria-label="Replay">
      <div className={css.controls}>
        <button className={css.btn} onClick={() => stepLap(-1)} title="Previous lap of focus ([)" aria-label="Previous lap">
          <IconPrev size={14} />
        </button>
        <button className={`${css.btn} ${css.play}`} onClick={() => useCursor.getState().setPlaying(!playing)} title="Play / pause (Space)" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button className={css.btn} onClick={() => stepLap(1)} title="Next lap of focus (])" aria-label="Next lap">
          <IconNext size={14} />
        </button>
        <button
          className={`${css.speed} num`}
          title="Playback speed"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMenu(
              { clientX: r.left, clientY: r.top - 8 - SPEEDS.length * 28, preventDefault() {}, stopPropagation() {} },
              SPEEDS.map((v) => ({ id: `s${v}`, label: `${v}×`, checked: v === speed, run: () => useCursor.getState().setSpeed(v) })),
            );
          }}
        >
          {speed}×
        </button>
      </div>
      {live && (
        <button
          className={css.live}
          data-following={live.following}
          data-testid="live-indicator"
          onClick={() => useApp.getState().setFollowing(true)}
          title={live.following ? "Following the live feed" : "Jump to live"}
          aria-label={live.following ? "Live" : "Go live"}
        >
          <span className={css.liveDot} aria-hidden />
          LIVE
        </button>
      )}
      {streamError && (
        <span className={css.offline} title={streamError}>
          Offline
        </span>
      )}
      <div className={css.clock}>
        <span className={css.seg}>{inSeg ? seg.label : t < (session.segments[0]?.t0 ?? 0) ? "Pre-session" : "Between"}</span>
        <span className={`${css.elapsed} num`}>{inSeg ? fmtClock(t - seg.t0) : fmtClock(t - lo)}</span>
        <span className={`${css.tod} num`}>
          {tod.text} {tod.zone}
        </span>
      </div>
      <div
        className={css.scrub}
        ref={ref}
        role="slider"
        aria-label="Replay position"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={t}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          setHover({ x: e.clientX - r.left, t: tAt(e.clientX) });
          if (e.buttons & 1) useCursor.getState().setT(tAt(e.clientX));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className={css.track} />
        {session.segments.map((g) => (
          <div key={g.id}>
            <div className={css.band} style={{ left: pct(g.t0), width: `calc(${pct(g.t1)} - ${pct(g.t0)})` }} />
            <span className={css.bandLabel} style={{ left: pct(g.t0), width: `calc(${pct(g.t1)} - ${pct(g.t0)})` }}>
              {g.label}
            </span>
          </div>
        ))}
        <div className={css.fill} style={{ width: pct(t) }} />
        {live && <div className={css.future} style={{ left: pct(live.head) }} />}
        {spans.map((s, i) => (
          <div key={i} className={css.span} title={s.state.toUpperCase()} style={{ left: pct(s.t0), width: `max(3px, calc(${pct(s.t1)} - ${pct(s.t0)}))`, background: SPAN_COLOUR[s.state] }} />
        ))}
        <div className={css.thumb} style={{ left: pct(t) }} />
        {hover && (
          <div className={`${css.hover} num`} style={{ left: hover.x }}>
            {(() => {
              const g = session.segments[segmentAt(session.segments, hover.t)];
              const inside = g && hover.t >= g.t0 && hover.t <= g.t1;
              return `${inside ? `${g.label} ${fmtClock(hover.t - g.t0)}` : fmtClock(hover.t - lo)} · ${timeOfDay(session, hover.t, clock).text}`;
            })()}
          </div>
        )}
      </div>
      <span className={`${css.end} num`}>{timeOfDay(session, hi, clock, false).text}</span>
    </footer>
  );
}

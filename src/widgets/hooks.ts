"use client";
import { useEffect, useMemo, useState } from "react";
import type { Columns } from "@/data/types";
import type { Lap, SessionModel } from "@/derive/model";
import { timingAt, type Timing } from "@/derive/timing";
import { topicFor } from "@/derive/topics";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";

/** Cursor time, updated at most `hz` times a second (tables do not need 60 fps). */
export function useT(hz = 8): number {
  const [t, setT] = useState(() => useCursor.getState().t);
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      last = performance.now();
      timer = null;
      setT(useCursor.getState().t);
    };
    const unsub = useCursor.subscribe((s, prev) => {
      if (s.t === prev.t) return;
      const wait = 1000 / hz - (performance.now() - last);
      if (wait <= 0) apply();
      else if (!timer) timer = setTimeout(apply, wait);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [hz]);
  return t;
}

export function useTiming(session: SessionModel, t: number): Timing {
  // Round to a tenth so identical frames reuse the result.
  const key = Math.round(t * 10) / 10;
  return useMemo(() => timingAt(session, key), [session, key]);
}

/** Decoded columns for the topics a widget needs; loads missing ones on demand. */
export function useTopics(topics: string[]): { cols: Record<string, Columns | undefined>; loading: boolean } {
  const key = topics.join("|");
  const all = useApp((s) => s.topics);
  const loadingMap = useApp((s) => s.loading);
  useEffect(() => {
    if (key) useApp.getState().ensureTopics(key.split("|"));
  }, [key]);
  const cols: Record<string, Columns | undefined> = {};
  let loading = false;
  for (const t of topics) {
    cols[t] = all[t];
    if (loadingMap[t]) loading = true;
  }
  return { cols, loading };
}

export function telemetryTopic(entity: string | null): string | null {
  const p = useApp.getState().topicMap?.patterns.telemetry;
  return p && entity ? topicFor(p, entity) : null;
}

export function poseTopic(entity: string): string | null {
  const p = useApp.getState().topicMap?.patterns.pose;
  return p ? topicFor(p, entity) : null;
}

export function bestLapOf(session: SessionModel, entity: string, segment: number | null = null, t = Infinity): Lap | null {
  let best: Lap | null = null;
  for (const l of session.lapsByEntity.get(entity) ?? []) {
    if (!l.valid || l.time == null || (l.t1 ?? Infinity) > t) continue;
    if (segment != null && l.segment !== segment) continue;
    if (!best || l.time < best.time!) best = l;
  }
  return best;
}

export interface Selection {
  a: { entity: string; lap: Lap } | null;
  b: { entity: string; lap: Lap } | null;
  /** True when nobody was chosen and the top two are used. */
  auto: boolean;
}

/** Focus and compare laps; falls back to the top two of the classification at t. */
export function useSelection(session: SessionModel, t: number): Selection {
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const focusLap = useApp((s) => s.focusLap);
  const compareLap = useApp((s) => s.compareLap);
  const timing = useTiming(session, t);
  return useMemo(() => {
    const pick = (entity: string | null, n: number | null) => {
      if (!entity) return null;
      const lap = n != null ? session.lapsByEntity.get(entity)?.find((l) => l.n === n) : bestLapOf(session, entity);
      return lap && lap.t1 != null ? { entity, lap } : null;
    };
    let a = pick(focus, focusLap);
    let b = pick(compare, compareLap);
    let auto = false;
    if (!focus && !compare) {
      const top = timing.rows.filter((r) => r.bestLap).slice(0, 2);
      a = top[0] ? { entity: top[0].entity.id, lap: top[0].bestLap! } : null;
      b = top[1] ? { entity: top[1].entity.id, lap: top[1].bestLap! } : null;
      auto = true;
    }
    return { a, b, auto };
  }, [session, focus, compare, focusLap, compareLap, timing]);
}

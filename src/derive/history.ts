import type { Lap, SessionModel } from "./model";

export interface HistoryPoint {
  /** Time the lap line was crossed. */
  t: number;
  lap: number;
  /** Seconds behind a car running the reference pace from the start. */
  gap: number;
  /** The car pitted on this lap. */
  pit: boolean;
}

export interface RaceHistory {
  /** Entity whose average lap sets the reference pace. */
  ref: string | null;
  pace: number | null;
  lines: Map<string, HistoryPoint[]>;
}

/**
 * Race history: each car's lap-line crossings against one fixed reference pace
 * (the leader's average lap). Unlike "gap to the current leader", the lines do
 * not jump when the leader pits, and lapped cars are compared at the same lap
 * count, so a pit stop shows as a step on the pitting car only.
 */
export function raceHistory(s: SessionModel, uptoT = Infinity): RaceHistory {
  const finished = (laps: Lap[]) => laps.filter((l) => l.t1 != null && l.t1 <= uptoT);
  let ref: string | null = null;
  let best: { n: number; t: number } | null = null;
  for (const e of s.entities) {
    const done = finished(s.lapsByEntity.get(e.id) ?? []);
    const last = done[done.length - 1];
    if (!last) continue;
    if (!best || last.n > best.n || (last.n === best.n && last.t1! < best.t)) {
      best = { n: last.n, t: last.t1! };
      ref = e.id;
    }
  }
  const lines = new Map<string, HistoryPoint[]>();
  if (!ref || !best) return { ref: null, pace: null, lines };
  const refLaps = s.lapsByEntity.get(ref)!;
  const first = refLaps.find((l) => l.n === 1) ?? refLaps[0];
  const start = first.t0;
  const n0 = first.n - 1;
  const pace = best.n > n0 ? (best.t - start) / (best.n - n0) : null;
  if (pace == null || !(pace > 0)) return { ref, pace: null, lines };
  for (const e of s.entities) {
    const pts: HistoryPoint[] = [];
    for (const l of finished(s.lapsByEntity.get(e.id) ?? [])) {
      if (l.n < 1) continue;
      pts.push({ t: l.t1!, lap: l.n, gap: l.t1! - (start + (l.n - n0) * pace), pit: l.pitIn });
    }
    lines.set(e.id, pts);
  }
  return { ref, pace, lines };
}

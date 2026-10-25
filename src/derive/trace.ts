import type { Columns } from "@/data/types";
import { indexAtOrAfter, indexAtOrBefore, interp } from "./search";

export interface LapTrace {
  /** Distance from the lap start, metres. */
  d: Float64Array;
  /** Time since the lap start, seconds. */
  tau: Float64Array;
  /** Channel values aligned with d. */
  ch: Record<string, Float64Array>;
  length: number;
}

const SPEED_FIELDS = ["speed_kph", "speed", "speed_mps"];

export function speedField(c: Columns): string | null {
  return SPEED_FIELDS.find((f) => c.num[f]) ?? null;
}

/**
 * Telemetry for one lap resampled to distance. Distance integrates speed and is scaled to
 * `trackLength` when given so laps line up at the line.
 */
export function lapTrace(c: Columns | undefined, t0: number, t1: number, trackLength: number | null, fields: string[]): LapTrace | null {
  if (!c || c.n < 2) return null;
  const sf = speedField(c);
  if (!sf) return null;
  const a = Math.max(0, indexAtOrBefore(c.t, t0));
  const b = Math.min(c.n - 1, indexAtOrAfter(c.t, t1));
  if (b - a < 4) return null;
  const n = b - a + 1;
  const d = new Float64Array(n);
  const tau = new Float64Array(n);
  const sp = c.num[sf];
  const k = sf === "speed_mps" ? 1 : 1 / 3.6;
  // Clamp the first and last samples to the lap bounds so tau runs 0..lapTime.
  for (let i = 0; i < n; i++) {
    const j = a + i;
    tau[i] = Math.min(Math.max(c.t[j], t0), t1) - t0;
    if (i > 0) {
      const v0 = Number.isFinite(sp[j - 1]) ? sp[j - 1] : 0;
      const v1 = Number.isFinite(sp[j]) ? sp[j] : v0;
      d[i] = d[i - 1] + ((v0 + v1) / 2) * k * (tau[i] - tau[i - 1]);
    }
  }
  const total = d[n - 1];
  if (total <= 0) return null;
  if (trackLength && Math.abs(total - trackLength) / trackLength < 0.15) {
    const s = trackLength / total;
    for (let i = 0; i < n; i++) d[i] *= s;
  }
  const ch: Record<string, Float64Array> = {};
  for (const f of fields) {
    const src = c.num[f];
    if (!src) continue;
    ch[f] = src.slice(a, b + 1);
  }
  return { d, tau, ch, length: d[n - 1] };
}

/** Δ = τB(d) − τA(d) on a regular distance grid. Positive: B is slower than A at that point. */
export function deltaTrace(a: LapTrace, b: LapTrace, step = 5): { d: Float64Array; delta: Float64Array } {
  const L = Math.min(a.length, b.length);
  const n = Math.max(2, Math.floor(L / step) + 1);
  const d = new Float64Array(n);
  const delta = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = i === n - 1 ? L : i * step;
    d[i] = x;
    delta[i] = interp(b.d, b.tau, x) - interp(a.d, a.tau, x);
  }
  return { d, delta };
}

/** Value of a trace channel at distance x. */
export function traceAt(tr: LapTrace, field: string, x: number): number | null {
  const v = tr.ch[field];
  if (!v) return field === "tau" ? interp(tr.d, tr.tau, x) : null;
  const val = interp(tr.d, v, x);
  return Number.isFinite(val) ? val : null;
}

/**
 * Mini-sector dominance: for each chunk of track, which lap is faster (−1 A, +1 B, 0 even).
 */
export function dominance(a: LapTrace, b: LapTrace, chunks = 25): { d0: number; d1: number; who: -1 | 0 | 1; gain: number }[] {
  const L = Math.min(a.length, b.length);
  const out: { d0: number; d1: number; who: -1 | 0 | 1; gain: number }[] = [];
  for (let i = 0; i < chunks; i++) {
    const d0 = (L * i) / chunks;
    const d1 = (L * (i + 1)) / chunks;
    const ta = interp(a.d, a.tau, d1) - interp(a.d, a.tau, d0);
    const tb = interp(b.d, b.tau, d1) - interp(b.d, b.tau, d0);
    const gain = tb - ta;
    out.push({ d0, d1, who: Math.abs(gain) < 0.005 ? 0 : gain > 0 ? -1 : 1, gain });
  }
  return out;
}

/** Interpolated position of an entity at time t from pose columns. */
export function poseAt(c: Columns | undefined, t: number): { x: number; y: number } | null {
  if (!c || c.n === 0) return null;
  const xs = c.num.x;
  const ys = c.num.y;
  if (!xs || !ys) return null;
  const i = indexAtOrBefore(c.t, t);
  if (i < 0) return null;
  if (t - c.t[i] > 10) return null;
  const j = Math.min(i + 1, c.n - 1);
  const dt = c.t[j] - c.t[i];
  const f = dt > 0 && dt < 2 ? Math.min(1, (t - c.t[i]) / dt) : 0;
  const x = xs[i] + (xs[j] - xs[i]) * f;
  const y = ys[i] + (ys[j] - ys[i]) * f;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** Point on the outline at a lap distance. */
export function outlinePoint(o: { x: Float64Array; y: Float64Array; d: Float64Array; length: number }, dist: number): { x: number; y: number } {
  const L = o.length;
  const x = ((dist % L) + L) % L;
  return { x: interp(o.d, o.x, x), y: interp(o.d, o.y, x) };
}

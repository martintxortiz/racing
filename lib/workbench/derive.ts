import { indexAt, type TopicData } from "./store";
import type { EntityId, Lap, LapFlag, LapRef, Sec, Segment } from "./types";

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function segmentAt(segments: Segment[], t: Sec): Segment | null {
  let cur: Segment | null = null;
  for (const s of segments) if (s.t0 <= t) cur = s;
  return cur;
}

function segmentOfLap(segments: Segment[], t0: Sec): string | null {
  // A lap belongs to the segment containing its start (laps begun before the flag count).
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s.t0 <= t0 + 1e-6) return s.t1 === null || t0 <= s.t1 ? s.id : null;
  }
  return null;
}

/** Lap index from canonical `/timing/laps` rows (stamped at lap start). */
export function buildLaps(laps: TopicData | undefined, segments: Segment[], flags: LapFlag[] = []): Lap[] {
  if (!laps) return [];
  const out: Lap[] = [];
  for (let i = 0; i < laps.length; i++) {
    const r = laps.rows[i];
    const entity = String(r.entity ?? r.driver_number);
    const n = Number(r.lap_number);
    const time = num(r.lap_time_s);
    const t0 = laps.t[i];
    out.push({
      entity,
      n,
      t0,
      t1: time === null ? null : t0 + time,
      time,
      sectors: [num(r.sector_1_s), num(r.sector_2_s), num(r.sector_3_s)],
      outLap: r.is_pit_out_lap === true,
      deleted: false,
      segment: segmentOfLap(segments, t0),
      timed: false,
    });
  }
  // Deletions: exact lap time first, then the lap the offence happened on, then the lap number.
  for (const f of flags) {
    const mine = out.filter((l) => l.entity === f.entity);
    const hit =
      (f.time !== undefined ? mine.find((l) => l.time !== null && Math.abs(l.time - f.time!) < 0.0015) : undefined) ??
      (f.at !== undefined ? mine.find((l) => l.t1 !== null && l.t0 <= f.at! && f.at! < l.t1) : undefined) ??
      mine.find((l) => l.n === f.lap);
    if (hit) {
      hit.deleted = true;
      hit.deletedReason = f.reason;
    }
  }
  // timed = has a time, not an out lap, within 107% of the segment's fastest lap.
  const min = new Map<string | null, number>();
  for (const l of out) {
    if (l.time === null || l.outLap) continue;
    min.set(l.segment, Math.min(min.get(l.segment) ?? Infinity, l.time));
  }
  for (const l of out) {
    l.timed = l.time !== null && !l.outLap && l.time <= 1.07 * (min.get(l.segment) ?? Infinity);
  }
  return out;
}

export function lapsByEntity(laps: Lap[]): Map<EntityId, Lap[]> {
  const m = new Map<EntityId, Lap[]>();
  for (const l of laps) {
    let a = m.get(l.entity);
    if (!a) m.set(l.entity, (a = []));
    a.push(l);
  }
  for (const a of m.values()) a.sort((x, y) => x.n - y.n);
  return m;
}

const isBestCandidate = (l: Lap) => l.timed && !l.deleted && l.time !== null;

/** Best non-deleted timed lap; optionally only in one segment and completed by t. */
export function bestLap(laps: Lap[] | undefined, opts: { segment?: string | null; t?: Sec } = {}): Lap | null {
  let best: Lap | null = null;
  for (const l of laps ?? []) {
    if (!isBestCandidate(l)) continue;
    if (opts.segment !== undefined && l.segment !== opts.segment) continue;
    if (opts.t !== undefined && (l.t1 === null || l.t1 > opts.t)) continue;
    if (!best || l.time! < best.time!) best = l;
  }
  return best;
}

/** Resolve a LapRef against one entity's laps. */
export function resolveLap(laps: Lap[] | undefined, ref: LapRef, t: Sec): Lap | null {
  if (!laps?.length) return null;
  if (ref === "best") return bestLap(laps);
  if (ref === "cursor") {
    let cur: Lap | null = null;
    for (const l of laps) if (l.t0 <= t) cur = l;
    return cur;
  }
  return laps.find((l) => l.n === ref.n) ?? null;
}

export type CellFlag = "purple" | "green" | null;

export interface TimingRow {
  entity: EntityId;
  pos: number | null;
  best: Lap | null;
  bestFlag: CellFlag;
  gap: number | null;
  sectors: [number | null, number | null, number | null];
  sectorFlags: [CellFlag, CellFlag, CellFlag];
  last: Lap | null;
  lastFlag: CellFlag;
  laps: number;
  tyre: { compound: string; age: number } | null;
  /** Segment id the driver was eliminated in, or null while still running. */
  eliminatedIn: string | null;
}

export interface TimingInput {
  entities: EntityId[];
  laps: Map<EntityId, Lap[]>;
  segments: Segment[];
  classification?: TopicData;
  stints?: Row[];
}

/** Everything the timing table shows at time t. */
export function timingAt(inp: TimingInput, t: Sec): TimingRow[] {
  const cur = segmentAt(inp.segments, t);
  const curIdx = cur ? inp.segments.indexOf(cur) : -1;

  // Who took part in each segment (from the whole recording; replay knows the future).
  const participants = new Map<string, Set<EntityId>>();
  for (const [e, ls] of inp.laps) {
    for (const l of ls) {
      if (!l.segment) continue;
      let s = participants.get(l.segment);
      if (!s) participants.set(l.segment, (s = new Set()));
      s.add(e);
    }
  }
  const eliminatedIn = (e: EntityId): string | null => {
    if (curIdx <= 0) return null;
    if (participants.get(inp.segments[curIdx].id)?.has(e)) return null;
    for (let j = curIdx - 1; j >= 0; j--) {
      if (participants.get(inp.segments[j].id)?.has(e)) return inp.segments[j].id;
    }
    return inp.segments[0].id; // never ran: out after the first segment
  };

  // Latest classification position per entity at or before t.
  const pos = new Map<EntityId, number>();
  const cl = inp.classification;
  if (cl) {
    const end = indexAt(cl.t, cl.length, t);
    for (let i = 0; i <= end; i++) {
      const r = cl.rows[i];
      const p = num(r.position);
      if (p !== null) pos.set(String(r.entity ?? r.driver_number), p);
    }
  }

  // Segment bests (purple) up to t.
  const segBest = new Map<string | null, { lap: number; s: [number, number, number] }>();
  const sb = (seg: string | null) => {
    let v = segBest.get(seg);
    if (!v) segBest.set(seg, (v = { lap: Infinity, s: [Infinity, Infinity, Infinity] }));
    return v;
  };
  for (const ls of inp.laps.values()) {
    for (const l of ls) {
      if (l.t1 === null || l.t1 > t || l.deleted || l.outLap) continue;
      const v = sb(l.segment);
      if (l.timed && l.time! < v.lap) v.lap = l.time!;
      l.sectors.forEach((s, k) => {
        if (s !== null && s < v.s[k]) v.s[k] = s;
      });
    }
  }

  const rows: TimingRow[] = inp.entities.map((e) => {
    const ls = inp.laps.get(e) ?? [];
    const elim = eliminatedIn(e);
    const seg = elim ?? cur?.id ?? null;
    const best = bestLap(ls, { segment: cur ? seg : undefined, t });
    const done = ls.filter((l, i) => {
      const end = l.t1 ?? ls[i + 1]?.t0 ?? Infinity;
      return end <= t;
    });
    const last = [...done].reverse().find((l) => l.time !== null) ?? null;
    // Personal bests up to t across the driver's laps in this segment.
    const pb = { lap: Infinity, s: [Infinity, Infinity, Infinity] };
    for (const l of done) {
      if (l.deleted || l.outLap || (cur && l.segment !== seg)) continue;
      if (l.timed && l.time! < pb.lap) pb.lap = l.time!;
      l.sectors.forEach((s, k) => {
        if (s !== null && s < pb.s[k]) pb.s[k] = s;
      });
    }
    const segV = segBest.get(seg) ?? { lap: Infinity, s: [Infinity, Infinity, Infinity] };
    const flag = (v: number | null, segMin: number, pbMin: number): CellFlag =>
      v === null ? null : v <= segMin ? "purple" : v <= pbMin ? "green" : null;
    const sectors = (best?.sectors ?? [null, null, null]) as TimingRow["sectors"];

    let tyre: TimingRow["tyre"] = null;
    const started = ls.filter((l) => l.t0 <= t);
    const n = started.length ? started[started.length - 1].n : null;
    if (n !== null && inp.stints) {
      for (const st of inp.stints) {
        if (String(st.entity ?? st.driver_number) !== e) continue;
        const a = num(st.lap_start) ?? 0;
        const b = num(st.lap_end) ?? Infinity;
        if (n >= a && n <= b) {
          tyre = { compound: String(st.compound ?? "?"), age: (num(st.tyre_age_at_start_laps) ?? 0) + n - a };
        }
      }
    }

    return {
      entity: e,
      pos: pos.get(e) ?? null,
      best,
      bestFlag: best && best.time! <= segV.lap ? "purple" : null,
      gap: null,
      sectors,
      sectorFlags: [0, 1, 2].map((k) => flag(sectors[k], segV.s[k], pb.s[k])) as TimingRow["sectorFlags"],
      last,
      lastFlag: last && !last.deleted && last.timed ? flag(last.time, segV.lap, pb.lap) : null,
      laps: done.length,
      tyre,
      eliminatedIn: elim,
    };
  });

  const segOrder = (r: TimingRow) => (r.eliminatedIn ? inp.segments.findIndex((s) => s.id === r.eliminatedIn) : Infinity);
  rows.sort((a, b) => {
    const g = segOrder(b) - segOrder(a);
    if (g) return g;
    if (a.pos !== null && b.pos !== null && a.pos !== b.pos) return a.pos - b.pos;
    const ta = a.best?.time ?? Infinity;
    const tb = b.best?.time ?? Infinity;
    if (ta !== tb) return ta - tb;
    return Number(a.entity) - Number(b.entity) || a.entity.localeCompare(b.entity);
  });
  // Gap to the fastest driver of the same group.
  const leader = new Map<string | null, number>();
  for (const r of rows) {
    if (r.best && !leader.has(r.eliminatedIn)) leader.set(r.eliminatedIn, r.best.time!);
    const lt = leader.get(r.eliminatedIn);
    if (r.best && lt !== undefined) r.gap = r.best.time! - lt;
  }
  return rows;
}

export interface LapTrace {
  entity: EntityId;
  lap: Lap;
  /** Lap distance per sample, metres. */
  d: Float64Array;
  /** Time since lap start per sample, seconds. */
  tau: Float64Array;
  channels: Record<string, Float32Array>;
  /** Distance normalisation factor; outside 0.95–1.05 is suspicious. */
  k: number;
  length: number;
}

/**
 * Lap distance from speed (F1 publishes no distance channel): integrate speed with
 * trapezoids over [t0 − 1 s, t1 + 1 s], zero at the lap start, normalise to L.
 */
export function lapTrace(tel: TopicData, lap: Lap, L: number | null, entity = lap.entity): LapTrace | null {
  if (lap.time === null || lap.t1 === null) return null;
  const T = lap.time;
  const i0 = Math.max(0, indexAt(tel.t, tel.length, lap.t0 - 1));
  const i1 = Math.min(tel.length - 1, indexAt(tel.t, tel.length, lap.t1 + 1) + 1);
  const speed = tel.cols.speed_kph;
  if (!speed || i1 - i0 < 3) return null;
  const n = i1 - i0 + 1;
  const tau = new Float64Array(n);
  const D = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    tau[j] = tel.t[i0 + j] - lap.t0;
    if (j > 0) {
      const v0 = (speed[i0 + j - 1] || 0) / 3.6;
      const v1 = (speed[i0 + j] || 0) / 3.6;
      D[j] = D[j - 1] + ((v0 + v1) / 2) * (tau[j] - tau[j - 1]);
    }
  }
  const at = (x: number) => interp(tau, D, x);
  const D0 = at(0);
  const DT = at(T) - D0;
  if (!(DT > 0)) return null;
  const length = L ?? DT;
  const k = length / DT;
  // Keep samples inside the lap and pin both ends.
  const keep: number[] = [];
  for (let j = 0; j < n; j++) if (tau[j] > 0 && tau[j] < T) keep.push(j);
  const m = keep.length + 2;
  const d = new Float64Array(m);
  const tt = new Float64Array(m);
  const channels: Record<string, Float32Array> = {};
  for (const name of Object.keys(tel.cols)) channels[name] = new Float32Array(m);
  const fill = (dst: number, x: number, src: number | null) => {
    tt[dst] = x;
    for (const name of Object.keys(tel.cols)) {
      const col = tel.cols[name];
      channels[name][dst] =
        src !== null ? col[i0 + src] : interp(tau, col.subarray(i0, i0 + n), x);
    }
  };
  fill(0, 0, null);
  d[0] = 0;
  keep.forEach((j, idx) => {
    fill(idx + 1, tau[j], j);
    d[idx + 1] = Math.min(length, Math.max(d[idx], k * (D[j] - D0)));
  });
  fill(m - 1, T, null);
  d[m - 1] = length;
  return { entity, lap, d, tau: tt, channels, k, length };
}

/** Linear interpolation of y over ascending x, clamped at the ends. */
export function interp(x: ArrayLike<number>, y: ArrayLike<number>, at: number): number {
  const n = x.length;
  if (!n) return NaN;
  if (at <= x[0]) return y[0];
  if (at >= x[n - 1]) return y[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= at) lo = mid;
    else hi = mid;
  }
  const dx = x[hi] - x[lo];
  return dx > 0 ? y[lo] + ((y[hi] - y[lo]) * (at - x[lo])) / dx : y[lo];
}

/** Δ(d) = τB(d) − τA(d) on a regular grid; positive means B is behind. */
export function deltaTrace(a: LapTrace, b: LapTrace, step = 5) {
  const L = Math.min(a.length, b.length);
  const n = Math.floor(L / step) + 1;
  const d = new Float64Array(n + 1);
  const delta = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    d[i] = i * step;
    delta[i] = interp(b.d, b.tau, d[i]) - interp(a.d, a.tau, d[i]);
  }
  d[n] = L;
  delta[n] = interp(b.d, b.tau, L) - interp(a.d, a.tau, L);
  return { d, delta };
}

/** Car position at t: linear interpolation when the neighbouring samples are ≤ 1 s apart. */
export function poseAt(pose: TopicData, t: Sec, maxGap = 1): [number, number] | null {
  const i = indexAt(pose.t, pose.length, t);
  if (i < 0) return null;
  const x = pose.cols.x_m;
  const y = pose.cols.y_m;
  if (i === pose.length - 1) return t - pose.t[i] <= maxGap ? [x[i], y[i]] : null;
  const t0 = pose.t[i];
  const t1 = pose.t[i + 1];
  if (t1 - t0 > maxGap) return t - t0 <= 1e-6 ? [x[i], y[i]] : null;
  const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return [x[i] + (x[i + 1] - x[i]) * f, y[i] + (y[i + 1] - y[i]) * f];
}

import type { Entity, Lap, Series, SessionModel } from "./model";
import { indexAtOrBefore } from "./search";
import { segmentAt } from "./session";

export type Mark = "sb" | "pb" | null;

/** Time at which each sector of a lap became known. */
export function sectorDoneAt(lap: Lap, i: 0 | 1 | 2): number | null {
  const [a, b, c] = lap.s;
  if (i === 0) return a != null ? lap.t0 + a : null;
  if (i === 1) return a != null && b != null ? lap.t0 + a + b : lap.t1 != null && b != null && c != null ? lap.t1 - c : null;
  return lap.t1 != null && c != null ? lap.t1 : null;
}

/** Sector time usable for bests: excludes pit lane and deleted laps. */
export function sectorUsable(lap: Lap, i: 0 | 1 | 2): number | null {
  if (lap.deleted) return null;
  if (i === 0 && lap.pitOut) return null;
  if (i === 2 && lap.pitIn) return null;
  return lap.s[i];
}

export interface Bests {
  lap: number | null;
  lapRef: Lap | null;
  sectors: [number | null, number | null, number | null];
  speedTrap: number | null;
  byEntity: Map<string, { lap: number | null; lapRef: Lap | null; sectors: [number | null, number | null, number | null]; speedTrap: number | null }>;
}

/**
 * Session and personal bests over laps known by time t. `segment` limits to one segment
 * (qualifying phases); null uses every lap.
 */
export function computeBests(laps: Lap[], t: number, segment: number | null = null): Bests {
  const out: Bests = { lap: null, lapRef: null, sectors: [null, null, null], speedTrap: null, byEntity: new Map() };
  for (const lap of laps) {
    if (segment != null && lap.segment !== segment) continue;
    let pe = out.byEntity.get(lap.entity);
    if (!pe) {
      pe = { lap: null, lapRef: null, sectors: [null, null, null], speedTrap: null };
      out.byEntity.set(lap.entity, pe);
    }
    if (lap.valid && lap.t1 != null && lap.t1 <= t && lap.time != null) {
      if (pe.lap == null || lap.time < pe.lap) {
        pe.lap = lap.time;
        pe.lapRef = lap;
      }
      if (out.lap == null || lap.time < out.lap) {
        out.lap = lap.time;
        out.lapRef = lap;
      }
    }
    for (const i of [0, 1, 2] as const) {
      const v = sectorUsable(lap, i);
      const at = sectorDoneAt(lap, i);
      if (v == null || at == null || at > t) continue;
      if (pe.sectors[i] == null || v < pe.sectors[i]!) pe.sectors[i] = v;
      if (out.sectors[i] == null || v < out.sectors[i]!) out.sectors[i] = v;
    }
    if (lap.st != null && lap.t1 != null && lap.t1 <= t && !lap.deleted) {
      if (pe.speedTrap == null || lap.st > pe.speedTrap) pe.speedTrap = lap.st;
      if (out.speedTrap == null || lap.st > out.speedTrap) out.speedTrap = lap.st;
    }
  }
  return out;
}

/** Purple when it equals the session best, green when it equals the personal best. */
export function mark(v: number | null, pb: number | null, sb: number | null): Mark {
  if (v == null) return null;
  if (sb != null && v <= sb + 1e-9) return "sb";
  if (pb != null && v <= pb + 1e-9) return "pb";
  return null;
}

export interface LiveLap {
  lap: Lap | null;
  /** Sector times known so far on the lap in progress. */
  sectors: [number | null, number | null, number | null];
  elapsed: number | null;
}

/** Latest completed lap and the lap in progress for one entity. */
export function lapState(laps: Lap[] | undefined, t: number): { last: Lap | null; live: LiveLap; done: number } {
  const live: LiveLap = { lap: null, sectors: [null, null, null], elapsed: null };
  if (!laps?.length) return { last: null, live, done: 0 };
  let last: Lap | null = null;
  let done = 0;
  for (const lap of laps) {
    const end = lap.t1;
    if (end != null && end <= t) {
      last = lap;
      done = Math.max(done, lap.n);
    } else if (lap.t0 <= t && (end == null || end > t) && t - lap.t0 < 600) {
      live.lap = lap;
      live.elapsed = t - lap.t0;
      for (const i of [0, 1] as const) {
        const at = sectorDoneAt(lap, i);
        if (at != null && at <= t) live.sectors[i] = lap.s[i];
      }
    }
  }
  return { last, live, done };
}

const seriesIndex = new WeakMap<Series, Map<string, { idx: Int32Array; t: Float64Array }>>();
function byEntity(s: Series): Map<string, { idx: Int32Array; t: Float64Array }> {
  let m = seriesIndex.get(s);
  if (!m) {
    const tmp = new Map<string, number[]>();
    for (let i = 0; i < s.t.length; i++) {
      const e = s.entity[i];
      if (!tmp.has(e)) tmp.set(e, []);
      tmp.get(e)!.push(i);
    }
    m = new Map();
    for (const [e, list] of tmp) m.set(e, { idx: Int32Array.from(list), t: Float64Array.from(list, (i) => s.t[i]) });
    seriesIndex.set(s, m);
  }
  return m;
}

/** Latest value of a series field for an entity at time t. */
export function seriesAt(s: Series | null, entity: string, field: string, t: number): number | null {
  if (!s || !s.values[field]) return null;
  const e = byEntity(s).get(entity);
  if (!e) return null;
  const k = indexAtOrBefore(e.t, t);
  if (k < 0) return null;
  const v = s.values[field][e.idx[k]];
  return Number.isFinite(v) ? v : null;
}

/** Field samples for one entity: [t[], v[]] with NaN dropped. */
export function seriesFor(s: Series | null, entity: string, field: string): [number[], number[]] {
  if (!s || !s.values[field]) return [[], []];
  const idx = byEntity(s).get(entity)?.idx ?? [];
  const ts: number[] = [];
  const vs: number[] = [];
  for (const i of idx) {
    const v = s.values[field][i];
    if (Number.isFinite(v)) {
      ts.push(s.t[i]);
      vs.push(v);
    }
  }
  return [ts, vs];
}

export type RowState = "running" | "pit" | "out" | "eliminated" | "retired";

export interface TimingRow {
  entity: Entity;
  pos: number | null;
  best: number | null;
  bestLap: Lap | null;
  gap: number | null;
  interval: number | null;
  /** Change in interval over the last lap: negative is closing. */
  trend: number | null;
  last: Lap | null;
  live: LiveLap;
  laps: number;
  state: RowState;
  /** Qualifying: segment the entity was eliminated in. */
  eliminatedIn: number | null;
  compound: string | null;
  tyreAge: number | null;
  pits: number;
  /** Laps behind leader (race), when lapped. */
  lapsDown: number | null;
}

export interface Timing {
  rows: TimingRow[];
  segment: number;
  bests: Bests;
  /** Bests over the whole session (for history marks). */
  overall: Bests;
  leaderLaps: number;
}

/** Segment index active at t: the last that started, or 0. */
export function activeSegment(s: SessionModel, t: number): number {
  return segmentAt(s.segments, t);
}

function participants(s: SessionModel): Set<string>[] {
  const per = s.segments.map(() => new Set<string>());
  for (const lap of s.laps) per[lap.segment]?.add(lap.entity);
  return per;
}
const participantCache = new WeakMap<SessionModel, Set<string>[]>();

function inPitAt(laps: Lap[] | undefined, t: number): boolean {
  if (!laps) return false;
  for (const lap of laps) {
    // In the pit lane between an in-lap end and the following out-lap start.
    if (lap.pitIn && lap.t1 != null && t >= lap.t1 - 5) {
      const next = laps.find((l) => l.n === lap.n + 1);
      if (!next || t < next.t0 + 25) {
        if (!next && t - lap.t1 < 3600) return true;
        if (next) return true;
      }
    }
  }
  return false;
}

function tyreAt(s: SessionModel, entity: string, lapN: number): { compound: string | null; age: number | null } {
  const mine = s.stints.filter((x) => x.entity === entity && x.lapStart <= lapN).sort((a, b) => b.lapStart - a.lapStart);
  const st = mine.find((x) => lapN <= x.lapEnd) ?? (mine[0] && lapN <= mine[0].lapEnd + 1 ? mine[0] : undefined);
  if (!st) return { compound: null, age: null };
  return { compound: st.compound, age: st.ageAtStart + (lapN - st.lapStart) + 1 };
}

function baseRow(s: SessionModel, e: Entity, t: number, segment: number | null): TimingRow {
  const laps = s.lapsByEntity.get(e.id);
  const { last, live, done } = lapState(laps, t);
  const pits = s.pits.filter((p) => p.entity === e.id && p.t <= t).length;
  const lapN = live.lap?.n ?? (last ? last.n + 1 : 1);
  const tyre = tyreAt(s, e.id, lapN);
  void segment;
  return {
    entity: e,
    pos: null,
    best: null,
    bestLap: null,
    gap: null,
    interval: null,
    trend: null,
    last,
    live,
    laps: done,
    state: inPitAt(laps, t) ? "pit" : "running",
    eliminatedIn: null,
    compound: tyre.compound,
    tyreAge: tyre.age,
    pits,
    lapsDown: null,
  };
}

/** Qualifying and practice: classification by best lap in the active segment. */
export function qualiTiming(s: SessionModel, t: number): Timing {
  const seg = activeSegment(s, t);
  const segIdx = s.kind === "qualifying" ? seg : null;
  const bests = computeBests(s.laps, t, segIdx);
  const overall = computeBests(s.laps, t, null);
  let parts = participantCache.get(s);
  if (!parts) {
    parts = participants(s);
    participantCache.set(s, parts);
  }
  const prevBests = s.kind === "qualifying" ? s.segments.map((_, i) => (i < seg ? computeBests(s.laps, t, i) : null)) : [];
  const rows = s.entities.map((e) => {
    const r = baseRow(s, e, t, segIdx);
    const pb = bests.byEntity.get(e.id);
    r.best = pb?.lap ?? null;
    r.bestLap = pb?.lapRef ?? null;
    if (s.kind === "qualifying" && seg > 0 && !parts[seg].has(e.id)) {
      // Did not take part in this phase: eliminated in the last phase they ran.
      let k = seg - 1;
      while (k > 0 && !parts[k].has(e.id)) k--;
      r.eliminatedIn = k;
      r.state = "eliminated";
      const pk = prevBests[k]?.byEntity.get(e.id);
      r.best = pk?.lap ?? null;
      r.bestLap = pk?.lapRef ?? null;
    }
    return r;
  });
  const rank = (r: TimingRow) => (r.eliminatedIn == null ? 1000 : r.eliminatedIn);
  rows.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return rb - ra;
    if (a.best == null && b.best == null) return a.entity.number.localeCompare(b.entity.number, undefined, { numeric: true });
    if (a.best == null) return 1;
    if (b.best == null) return -1;
    return a.best - b.best;
  });
  const leader = rows.find((r) => r.eliminatedIn == null && r.best != null)?.best ?? null;
  let prev: number | null = null;
  rows.forEach((r, i) => {
    r.pos = r.best != null || r.eliminatedIn != null ? i + 1 : null;
    if (r.eliminatedIn == null) {
      r.gap = r.best != null && leader != null ? r.best - leader : null;
      r.interval = r.best != null && prev != null ? r.best - prev : null;
      if (r.best != null) prev = r.best;
    }
  });
  return { rows, segment: seg, bests, overall, leaderLaps: 0 };
}

/** Race: order from the position feed, gaps from the interval feed with a lap fallback. */
export function raceTiming(s: SessionModel, t: number): Timing {
  const bests = computeBests(s.laps, t, null);
  const rows = s.entities.map((e) => baseRow(s, e, t, null));
  for (const r of rows) {
    const pb = bests.byEntity.get(r.entity.id);
    r.best = pb?.lap ?? null;
    r.bestLap = pb?.lapRef ?? null;
    r.pos = seriesAt(s.order, r.entity.id, "position", t);
    r.gap = seriesAt(s.intervals, r.entity.id, "gap_to_leader_s", t);
    r.interval = seriesAt(s.intervals, r.entity.id, "interval_s", t);
    const lapsDown = seriesAt(s.intervals, r.entity.id, "gap_to_leader_laps", t);
    r.lapsDown = lapsDown != null && lapsDown > 0 ? lapsDown : null;
    const lastLap = r.last?.time ?? 100;
    const before = seriesAt(s.intervals, r.entity.id, "interval_s", t - lastLap);
    r.trend = r.interval != null && before != null ? r.interval - before : null;
  }
  const leaderLaps = Math.max(0, ...rows.map((r) => r.laps));
  for (const r of rows) {
    const laps = s.lapsByEntity.get(r.entity.id);
    const lastT = laps?.length ? Math.max(...laps.map((l) => l.t1 ?? l.t0)) : -Infinity;
    const total = laps?.length ? laps[laps.length - 1].n : 0;
    // Stopped timing and classified out (or far short of the distance): retired.
    const out = s.dnf.size ? s.dnf.has(r.entity.id) : total < s.raceLaps - 3;
    if (out && t > lastT + 60 && t > (s.segments[0]?.t0 ?? 0)) r.state = "retired";
  }
  const hasOrder = rows.some((r) => r.pos != null);
  rows.sort((a, b) => {
    const ra = a.state === "retired" ? 1 : 0;
    const rb = b.state === "retired" ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (hasOrder) return (a.pos ?? 999) - (b.pos ?? 999);
    if (a.laps !== b.laps) return b.laps - a.laps;
    return (a.last?.t1 ?? Infinity) - (b.last?.t1 ?? Infinity);
  });
  if (!s.intervals) {
    // Gap from lap crossings: time behind the leader at the same lap count.
    const leader = rows[0];
    const cross = (id: string, n: number) => s.lapsByEntity.get(id)?.find((l) => l.n === n)?.t1 ?? null;
    let prevId: string | null = null;
    for (const r of rows) {
      if (r.laps > 0) {
        const lt = cross(leader.entity.id, r.laps);
        const me = cross(r.entity.id, r.laps);
        r.gap = lt != null && me != null ? me - lt : null;
        if (prevId) {
          const pt = cross(prevId, r.laps);
          r.interval = pt != null && me != null ? me - pt : null;
        }
        r.lapsDown = leader.laps - r.laps > 0 ? leader.laps - r.laps : null;
      }
      prevId = r.entity.id;
    }
  }
  rows.forEach((r, i) => {
    if (!hasOrder || r.pos == null) r.pos = i + 1;
  });
  return { rows, segment: 0, bests, overall: bests, leaderLaps };
}

export function timingAt(s: SessionModel, t: number): Timing {
  return s.kind === "race" ? raceTiming(s, t) : qualiTiming(s, t);
}

export interface SectorRow {
  entity: Entity;
  sectors: [number | null, number | null, number | null];
  ideal: number | null;
  best: number | null;
  /** Best lap minus ideal lap. */
  loss: number | null;
}

/** Best sectors, ideal lap and time lost per entity over laps known at t (optionally one segment). */
export function sectorTable(s: SessionModel, t: number, segment: number | null): { rows: SectorRow[]; bests: Bests; idealBest: number | null } {
  const bests = computeBests(s.laps, t, segment);
  const rows: SectorRow[] = [];
  for (const e of s.entities) {
    const pe = bests.byEntity.get(e.id);
    if (!pe) continue;
    const [a, b, c] = pe.sectors;
    const ideal = a != null && b != null && c != null ? a + b + c : null;
    rows.push({ entity: e, sectors: pe.sectors, ideal, best: pe.lap, loss: ideal != null && pe.lap != null ? pe.lap - ideal : null });
  }
  rows.sort((x, y) => (x.ideal ?? Infinity) - (y.ideal ?? Infinity));
  const idealBest = rows[0]?.ideal ?? null;
  return { rows, bests, idealBest };
}

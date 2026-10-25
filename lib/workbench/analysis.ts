// Session-agnostic analyses behind the widgets. Pure functions over the store and lap index,
// so they work for any series, game or session kind and are easy to test.

import { bestLap } from "./derive";
import { indexAt, type TopicData } from "./store";
import type { EntityId, Lap, Sec } from "./types";

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const entityOf = (r: Row) => String(r.entity ?? r.driver_number ?? r.vehicle ?? "");

// ---------- field names and units ----------

export interface FieldMeta {
  key: string;
  label: string;
  unit: string;
  digits: number;
  /** Step-shaped signal (gear, flags). */
  step?: boolean;
  /** Fixed range, e.g. 0–100 for pedals. */
  range?: [number, number];
}

const KNOWN: Record<string, Partial<FieldMeta>> = {
  speed_kph: { label: "Speed", digits: 0 },
  rpm: { label: "RPM", digits: 0 },
  gear: { label: "Gear", digits: 0, step: true },
  throttle_pct: { label: "Throttle", digits: 0, range: [0, 100] },
  brake_pct: { label: "Brake", digits: 0, range: [0, 100] },
  steering_deg: { label: "Steering", digits: 0 },
  drs: { label: "DRS", digits: 0, step: true },
  air_temperature_c: { label: "Air", digits: 1 },
  track_temperature_c: { label: "Track", digits: 1 },
  humidity_pct: { label: "Humidity", digits: 0 },
  pressure_mbar: { label: "Pressure", digits: 0 },
  rainfall: { label: "Rain", digits: 0, step: true },
  wind_direction_deg: { label: "Wind direction", digits: 0 },
  wind_speed_mps: { label: "Wind", digits: 1 },
};
const UNITS: [RegExp, string][] = [
  [/_kph$/, "km/h"],
  [/_mps$/, "m/s"],
  [/_pct$/, "%"],
  [/_c$/, "°C"],
  [/_deg$/, "°"],
  [/_mbar$/, "mbar"],
  [/_bar$/, "bar"],
  [/_kpa$/, "kPa"],
  [/_m$/, "m"],
  [/_s$/, "s"],
  [/_l$/, "L"],
  [/_kw$/, "kW"],
  [/_nm$/, "N·m"],
  [/_g$/, "g"],
  [/_kj$/, "kJ"],
];

/** Label, unit and precision for any canonical field name; unknown fields degrade to their name. */
export function fieldMeta(key: string): FieldMeta {
  const k = KNOWN[key] ?? {};
  const unitHit = UNITS.find(([re]) => re.test(key));
  const base = unitHit ? key.replace(unitHit[0], "") : key;
  const label = k.label ?? base.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return { key, label, unit: unitHit?.[1] ?? "", digits: k.digits ?? 1, step: k.step, range: k.range };
}

/** Numeric fields of a stream topic (columns) or a row topic (numbers in the rows). */
export function numericFields(d: TopicData | undefined, exclude: string[] = []): string[] {
  if (!d) return [];
  const skip = new Set(["timestamp_ns", "driver_number", ...exclude]);
  if (Object.keys(d.cols).length) return Object.keys(d.cols).filter((k) => !skip.has(k));
  const seen = new Set<string>();
  for (let i = 0; i < Math.min(d.rows.length, 50); i++) {
    for (const [k, v] of Object.entries(d.rows[i])) if (typeof v === "number" && !skip.has(k)) seen.add(k);
  }
  return [...seen];
}

/** Value of a field at t (last sample at or before t), from columns or rows. */
export function valueAt(d: TopicData | undefined, key: string, t: Sec): number | null {
  if (!d) return null;
  const i = indexAt(d.t, d.length, t);
  if (i < 0) return null;
  const col = d.cols[key];
  return col ? (Number.isFinite(col[i]) ? col[i] : null) : num(d.rows[i]?.[key]);
}

// ---------- track status ----------

export interface TrackStatus {
  /** Track-wide state: GREEN, YELLOW, RED, SC, VSC, CHEQUERED … or null before any message. */
  flag: string | null;
  message: string | null;
  since: Sec | null;
  /** Sectors currently under a local flag. */
  sectors: { sector: number; flag: string }[];
}

const TRACK_WIDE = /^(GREEN|RED|CHEQUERED|SC|VSC|SAFETY CAR|VIRTUAL SAFETY CAR|FCY|FULL COURSE YELLOW|CODE 60|SLOW ZONE)/;

/** Current track status from an events topic (flag rows with no car scope). */
export function trackStatusAt(events: TopicData | undefined, t: Sec): TrackStatus {
  const out: TrackStatus = { flag: null, message: null, since: null, sectors: [] };
  if (!events) return out;
  const end = indexAt(events.t, events.length, t);
  const sectors = new Map<number, string>();
  for (let i = 0; i <= end; i++) {
    const r = events.rows[i];
    const flag = typeof r.flag === "string" ? r.flag.toUpperCase() : null;
    const cat = String(r.category ?? "");
    const msg = String(r.message ?? "");
    const sector = num(r.sector);
    const scope = String(r.scope ?? "").toLowerCase();
    if (/safety ?car|sc|vsc|fcy/i.test(cat) || /SAFETY CAR|VSC|FULL COURSE/.test(msg)) {
      const state = /ENDING|IN THIS LAP|WITHDRAWN|CLEAR/.test(msg) ? "GREEN" : /VIRTUAL|VSC/.test(msg) ? "VSC" : "SC";
      out.flag = state;
      out.message = msg;
      out.since = events.t[i];
      continue;
    }
    if (!flag) continue;
    if (sector !== null && scope !== "track") {
      if (flag === "CLEAR" || flag === "GREEN") sectors.delete(sector);
      else sectors.set(sector, flag);
      continue;
    }
    if (r.entity != null || scope === "driver") continue; // blue flags, black-and-white …
    if (TRACK_WIDE.test(flag) || flag === "CLEAR" || flag.includes("YELLOW")) {
      out.flag = flag === "CLEAR" ? "GREEN" : flag;
      out.message = msg;
      out.since = events.t[i];
      if (flag === "GREEN" || flag === "CLEAR") sectors.clear();
    }
  }
  out.sectors = [...sectors].sort((a, b) => a[0] - b[0]).map(([sector, flag]) => ({ sector, flag }));
  return out;
}

// ---------- lap-by-lap series (gap chart) ----------

export type LapSeriesMode = "gap" | "interval" | "position" | "pace" | "delta";

/**
 * One value per entity per lap number:
 * - gap: seconds behind the leader at the end of lap n (or behind `ref`, when given)
 * - interval: seconds behind the car ahead at the end of lap n
 * - position: running order at the end of lap n (classification when given, else elapsed order)
 * - pace: lap time of lap n
 * - delta: lap time of lap n minus the reference's lap n (or the reference's best when it has none)
 */
export function lapSeries(
  laps: Map<EntityId, Lap[]>,
  mode: LapSeriesMode,
  opts: { ref?: EntityId | null; classification?: TopicData; entities?: EntityId[]; t?: Sec } = {},
): Map<EntityId, [number, number | null][]> {
  const tMax = opts.t ?? Infinity;
  const ids = opts.entities ?? [...laps.keys()];
  const end = new Map<EntityId, Map<number, number>>();
  let maxN = 0;
  for (const [e, ls] of laps) {
    const m = new Map<number, number>();
    for (const l of ls) if (l.t1 !== null && l.t1 <= tMax) m.set(l.n, l.t1);
    end.set(e, m);
    for (const n of m.keys()) maxN = Math.max(maxN, n);
  }
  const out = new Map<EntityId, [number, number | null][]>();
  const posAt = (e: EntityId, at: Sec): number | null => {
    const cl = opts.classification;
    if (!cl) return null;
    const i = indexAt(cl.t, cl.length, at);
    for (let j = i; j >= 0; j--) if (entityOf(cl.rows[j]) === e) return num(cl.rows[j].position);
    return null;
  };
  for (const e of ids) {
    const ls = (laps.get(e) ?? []).filter((l) => l.t1 !== null && l.t1 <= tMax);
    const pts: [number, number | null][] = [];
    if (mode === "pace") {
      for (const l of ls) pts.push([l.n, l.time]);
    } else if (mode === "delta") {
      const refLaps = opts.ref ? laps.get(opts.ref) ?? [] : [];
      const refBest = bestLap(refLaps)?.time ?? null;
      for (const l of ls) {
        const r = refLaps.find((x) => x.n === l.n)?.time ?? refBest;
        pts.push([l.n, l.time !== null && r !== null ? l.time - r : null]);
      }
    } else {
      for (const l of ls) {
        const n = l.n;
        const mine = l.t1!;
        const others: number[] = [];
        for (const [o, m] of end) if (o !== e && m.has(n)) others.push(m.get(n)!);
        if (mode === "gap") {
          const base = opts.ref ? end.get(opts.ref)?.get(n) : Math.min(mine, ...others);
          pts.push([n, base === undefined ? null : mine - base]);
        } else if (mode === "interval") {
          const ahead = others.filter((x) => x < mine);
          pts.push([n, ahead.length ? mine - Math.max(...ahead) : 0]);
        } else {
          pts.push([n, posAt(e, mine + 0.001) ?? 1 + others.filter((x) => x < mine).length]);
        }
      }
    }
    out.set(e, pts);
  }
  void maxN;
  return out;
}

// ---------- stints ----------

export interface Stint {
  entity: EntityId;
  n: number;
  lapStart: number;
  lapEnd: number;
  compound: string | null;
  ageAtStart: number;
  driver: string | null;
}

/**
 * Stints from a stints topic; without one, stints are inferred from out laps (a new stint
 * starts at every out lap), so the widget still works for feeds without tyre data.
 */
export function stintsOf(laps: Map<EntityId, Lap[]>, rows: Row[] | undefined, t = Infinity): Map<EntityId, Stint[]> {
  const out = new Map<EntityId, Stint[]>();
  const lastLap = (e: EntityId) => {
    const ls = (laps.get(e) ?? []).filter((l) => l.t0 <= t);
    return ls.length ? ls[ls.length - 1].n : 0;
  };
  if (rows?.length) {
    for (const r of rows) {
      const e = entityOf(r);
      const a = num(r.lap_start) ?? 1;
      const cap = lastLap(e);
      if (Number.isFinite(t) && a > cap) continue;
      const b = Math.min(num(r.lap_end) ?? cap, Number.isFinite(t) ? cap : Infinity);
      const list = out.get(e) ?? [];
      list.push({
        entity: e,
        n: num(r.stint_number) ?? list.length + 1,
        lapStart: a,
        lapEnd: Math.max(a, b),
        compound: r.compound != null ? String(r.compound) : null,
        ageAtStart: num(r.tyre_age_at_start_laps) ?? 0,
        driver: typeof r.driver === "string" ? r.driver : null,
      });
      out.set(e, list);
    }
    for (const list of out.values()) list.sort((x, y) => x.lapStart - y.lapStart);
    return out;
  }
  for (const [e, all] of laps) {
    const ls = all.filter((l) => l.t0 <= t);
    const list: Stint[] = [];
    for (const l of ls) {
      const cur = list[list.length - 1];
      const swap = cur && l.driver && cur.driver && l.driver !== cur.driver;
      if (!cur || l.outLap || swap) {
        list.push({ entity: e, n: list.length + 1, lapStart: l.n, lapEnd: l.n, compound: null, ageAtStart: 0, driver: l.driver ?? null });
      } else cur.lapEnd = l.n;
    }
    if (list.length) out.set(e, list);
  }
  return out;
}

// ---------- sectors and ideal lap ----------

export interface SectorSummary {
  entity: EntityId;
  best: Lap | null;
  /** Best time in each sector over the entity's laps. */
  sectors: (number | null)[];
  /** Sum of the best sectors, when every sector has a time. */
  ideal: number | null;
  /** best lap − ideal lap. */
  gain: number | null;
}

/** Best sectors, ideal lap and potential gain per entity, plus the field's best per sector. */
export function sectorSummary(laps: Map<EntityId, Lap[]>, ids: EntityId[], t = Infinity) {
  let n = 0;
  for (const ls of laps.values()) for (const l of ls) n = Math.max(n, l.sectors.length);
  const field: number[] = new Array(n).fill(Infinity);
  const rows: SectorSummary[] = ids.map((e) => {
    const ls = (laps.get(e) ?? []).filter((l) => l.t1 !== null && l.t1 <= t && !l.deleted && !l.outLap);
    const sectors: (number | null)[] = new Array(n).fill(null);
    for (const l of ls) {
      l.sectors.forEach((s, i) => {
        if (s !== null && (sectors[i] === null || s < sectors[i]!)) sectors[i] = s;
      });
    }
    sectors.forEach((s, i) => {
      if (s !== null && s < field[i]) field[i] = s;
    });
    const best = bestLap(ls, { t });
    const ideal = n && sectors.every((s) => s !== null) ? sectors.reduce<number>((a, s) => a + s!, 0) : null;
    return { entity: e, best, sectors, ideal, gain: best?.time != null && ideal !== null ? best.time - ideal : null };
  });
  return { n, rows, field: field.map((v) => (Number.isFinite(v) ? v : null)) };
}

// ---------- lap time distribution ----------

/** Quartiles of an entity's representative laps (timed, not deleted). */
export function lapQuartiles(ls: Lap[]): { min: number; q1: number; median: number; q3: number; max: number; n: number } | null {
  const xs = ls.filter((l) => l.timed && !l.deleted && l.time !== null).map((l) => l.time!).sort((a, b) => a - b);
  if (!xs.length) return null;
  const q = (p: number) => {
    const i = (xs.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo);
  };
  return { min: xs[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: xs[xs.length - 1], n: xs.length };
}

// ---------- running order ----------

/**
 * Running order at t: the latest classification position per entity when the feed has one,
 * otherwise most laps completed, then earliest finish of that lap, then best lap ("race"), or
 * fastest best lap ("best", for practice and qualifying). Entities
 * with no data keep their input order at the end.
 */
export function orderAt(
  laps: Map<EntityId, Lap[]>,
  ids: EntityId[],
  classification: TopicData | undefined,
  t: Sec,
  by: "race" | "best" = "race",
): EntityId[] {
  const pos = new Map<EntityId, number>();
  if (classification) {
    const end = indexAt(classification.t, classification.length, t);
    for (let i = 0; i <= end; i++) {
      const r = classification.rows[i];
      const p = num(r.position);
      if (p !== null) pos.set(entityOf(r), p);
    }
  }
  const key = (e: EntityId) => {
    const ls = (laps.get(e) ?? []).filter((l) => l.t1 !== null && l.t1 <= t);
    const last = ls[ls.length - 1];
    return { n: last?.n ?? 0, at: last?.t1 ?? Infinity, best: bestLap(ls)?.time ?? Infinity };
  };
  const keys = new Map(ids.map((e) => [e, key(e)]));
  const idx = new Map(ids.map((e, i) => [e, i]));
  return [...ids].sort((a, b) => {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (pa !== undefined || pb !== undefined) return (pa ?? Infinity) - (pb ?? Infinity) || idx.get(a)! - idx.get(b)!;
    const ka = keys.get(a)!;
    const kb = keys.get(b)!;
    if (by === "best") return ka.best - kb.best || idx.get(a)! - idx.get(b)!;
    return kb.n - ka.n || ka.at - kb.at || ka.best - kb.best || idx.get(a)! - idx.get(b)!;
  });
}

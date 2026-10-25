import type { Columns, FileSummary } from "@/data/types";
import { parseOffset } from "@/data/format";
import type { Corner, Entity, Lap, Outline, Pit, Radio, RcEvent, Segment, Series, SessionKind, SessionModel, Stint } from "./model";
import { resolveTopics } from "./topics";
import { buildSegments, sessionWindow } from "./segments";

type ColMap = Map<string, Columns>;

function numOf(c: Columns | undefined, ...names: string[]): Float64Array | null {
  if (!c) return null;
  for (const n of names) if (c.num[n]) return c.num[n];
  return null;
}
function strOf(c: Columns | undefined, ...names: string[]): (string | null)[] | null {
  if (!c) return null;
  for (const n of names) {
    if (c.str[n]) return c.str[n];
    if (c.num[n]) return Array.from(c.num[n], (v) => (Number.isFinite(v) ? String(v) : null));
  }
  return null;
}
function jsonOf(c: Columns | undefined, ...names: string[]): unknown[] | null {
  if (!c) return null;
  for (const n of names) if (c.json[n]) return c.json[n];
  return null;
}
const fin = (v: number | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);
const ENTITY_KEYS = ["driver_number", "entity_id", "vehicle_id", "id"];

export function sessionKind(type: string | null | undefined, name?: string | null): SessionKind {
  const s = `${type ?? ""} ${name ?? ""}`.toLowerCase();
  if (/quali|shootout/.test(s)) return "qualifying";
  if (/race|sprint(?! shootout)|feature/.test(s)) return "race";
  return "practice";
}

export function buildEntities(c: Columns | undefined): Entity[] {
  if (!c) return [];
  const id = strOf(c, ...ENTITY_KEYS) ?? [];
  const code = strOf(c, "code", "abbreviation", "short_name");
  const name = strOf(c, "full_name", "name", "broadcast_name");
  const team = strOf(c, "team_name", "team", "class");
  const colour = strOf(c, "team_colour", "colour", "color");
  const seen = new Map<string, Entity>();
  for (let i = 0; i < c.n; i++) {
    const e = id[i];
    if (!e) continue;
    let col = colour?.[i] ?? "";
    if (col && !col.startsWith("#")) col = `#${col}`;
    seen.set(e, {
      id: e,
      number: e,
      code: code?.[i] ?? e,
      name: name?.[i] ?? e,
      team: team?.[i] ?? "",
      colour: /^#[0-9a-f]{6}$/i.test(col) ? col.toUpperCase() : "#8D8D8D",
    });
  }
  return [...seen.values()];
}

export function buildEvents(c: Columns | undefined): RcEvent[] {
  if (!c) return [];
  const cat = strOf(c, "category", "kind");
  const flag = strOf(c, "flag");
  const scope = strOf(c, "scope");
  const sector = numOf(c, "sector");
  const ent = strOf(c, ...ENTITY_KEYS);
  const lap = numOf(c, "lap_number", "lap");
  const phase = numOf(c, "qualifying_phase", "phase");
  const msg = strOf(c, "message", "text");
  const out: RcEvent[] = [];
  for (let i = 0; i < c.n; i++) {
    out.push({
      t: c.t[i],
      category: cat?.[i] ?? "Other",
      flag: flag?.[i] ?? null,
      scope: scope?.[i] ?? null,
      sector: fin(sector?.[i]),
      entity: ent?.[i] ?? null,
      lap: fin(lap?.[i]),
      phase: fin(phase?.[i]),
      message: msg?.[i] ?? "",
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Lap deletions announced by race control: entity -> set of lap numbers. */
const DELETED_RE = /^CAR (\d+) \(\w+\) (?:TIME \S+ |LAP )DELETED\b.*?\bLAP (\d+)\b/;
export function deletedLaps(events: RcEvent[]): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const e of events) {
    const m = DELETED_RE.exec(e.message);
    if (!m) continue;
    if (/REINSTATED/.test(e.message)) continue;
    if (!out.has(m[1])) out.set(m[1], new Map());
    out.get(m[1])!.set(Number(m[2]), e.t);
  }
  return out;
}

export function buildStints(c: Columns | undefined): Stint[] {
  if (!c) return [];
  const ent = strOf(c, ...ENTITY_KEYS) ?? [];
  const n = numOf(c, "stint_number", "stint");
  const ls = numOf(c, "lap_start");
  const le = numOf(c, "lap_end");
  const comp = strOf(c, "compound", "tyre");
  const age = numOf(c, "tyre_age_at_start_laps", "tyre_age");
  const out: Stint[] = [];
  for (let i = 0; i < c.n; i++) {
    if (!ent[i] || !ls || !Number.isFinite(ls[i])) continue;
    out.push({
      entity: ent[i]!,
      n: fin(n?.[i]) ?? i + 1,
      lapStart: ls[i],
      lapEnd: fin(le?.[i]) ?? ls[i],
      compound: (comp?.[i] ?? "UNKNOWN").toUpperCase(),
      ageAtStart: fin(age?.[i]) ?? 0,
    });
  }
  return out;
}

export function buildPits(c: Columns | undefined): Pit[] {
  if (!c) return [];
  const ent = strOf(c, ...ENTITY_KEYS) ?? [];
  const lap = numOf(c, "lap_number", "lap");
  const lane = numOf(c, "lane_duration_s", "pit_duration_s");
  const stop = numOf(c, "stop_duration_s");
  const out: Pit[] = [];
  for (let i = 0; i < c.n; i++) {
    if (!ent[i]) continue;
    out.push({ t: c.t[i], entity: ent[i]!, lap: fin(lap?.[i]), lane: fin(lane?.[i]), stop: fin(stop?.[i]) });
  }
  return out;
}

export interface LapInput {
  t: ArrayLike<number>;
  entity: (string | null)[];
  n: ArrayLike<number>;
  time: ArrayLike<number>;
  s1?: ArrayLike<number> | null;
  s2?: ArrayLike<number> | null;
  s3?: ArrayLike<number> | null;
  i1?: ArrayLike<number> | null;
  i2?: ArrayLike<number> | null;
  st?: ArrayLike<number> | null;
  pitOut?: ArrayLike<number> | null;
}

/** Laps per entity, sorted, with in/out, deleted, segment and tyre attached. */
export function buildLaps(
  input: LapInput,
  opts: { segments: Segment[]; deleted?: Map<string, Map<number, number>>; stints?: Stint[]; pits?: Pit[] },
): Lap[] {
  const by = new Map<string, Lap[]>();
  const len = input.t.length;
  for (let i = 0; i < len; i++) {
    const e = input.entity[i];
    if (!e || !Number.isFinite(input.n[i])) continue;
    const time = fin(input.time[i]);
    const lap: Lap = {
      entity: e,
      n: input.n[i],
      t0: input.t[i],
      t1: time != null ? input.t[i] + time : null,
      time,
      s: [fin(input.s1?.[i]), fin(input.s2?.[i]), fin(input.s3?.[i])],
      i1: fin(input.i1?.[i]),
      i2: fin(input.i2?.[i]),
      st: fin(input.st?.[i]),
      pitOut: (input.pitOut?.[i] ?? 0) > 0,
      pitIn: false,
      deleted: !!opts.deleted?.get(e)?.has(input.n[i]),
      segment: segmentAt(opts.segments, input.t[i] + (time ?? 0) / 2),
      compound: null,
      tyreAge: null,
      valid: false,
    };
    if (!by.has(e)) by.set(e, []);
    by.get(e)!.push(lap);
  }
  const pitLaps = new Map<string, Set<number>>();
  for (const p of opts.pits ?? []) {
    if (p.lap == null) continue;
    if (!pitLaps.has(p.entity)) pitLaps.set(p.entity, new Set());
    pitLaps.get(p.entity)!.add(p.lap);
  }
  const out: Lap[] = [];
  for (const [e, laps] of by) {
    laps.sort((a, b) => a.n - b.n);
    const stints = (opts.stints ?? []).filter((s) => s.entity === e).sort((a, b) => a.lapStart - b.lapStart);
    for (let k = 0; k < laps.length; k++) {
      const lap = laps[k];
      const next = laps[k + 1];
      if (lap.t1 == null && next && next.n === lap.n + 1) lap.t1 = next.t0;
      if (next && next.n === lap.n + 1 && next.pitOut) lap.pitIn = true;
      if (pitLaps.get(e)?.has(lap.n) && !lap.pitOut) lap.pitIn = true;
      const st = stints.find((s) => lap.n >= s.lapStart && lap.n <= s.lapEnd);
      if (st) {
        lap.compound = st.compound;
        lap.tyreAge = st.ageAtStart + (lap.n - st.lapStart) + 1;
      }
      lap.valid = lap.time != null && !lap.deleted && !lap.pitOut && !lap.pitIn;
      out.push(lap);
    }
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.entity.localeCompare(b.entity));
}

export function segmentAt(segments: Segment[], t: number): number {
  for (let i = segments.length - 1; i >= 0; i--) if (t >= segments[i].t0) return i;
  return 0;
}

function buildSeries(c: Columns | undefined, fields: string[]): Series | null {
  if (!c || c.n === 0) return null;
  const ent = strOf(c, ...ENTITY_KEYS) ?? [];
  const values: Record<string, Float64Array> = {};
  for (const f of fields) {
    const v = numOf(c, f);
    if (v) values[f] = v;
  }
  return { t: c.t, entity: ent.map((e) => e ?? ""), values };
}

function parseArray(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function buildRadio(c: Columns | undefined): Radio[] {
  if (!c) return [];
  const ent = strOf(c, ...ENTITY_KEYS) ?? [];
  const url = strOf(c, "recording_url", "url", "audio_url") ?? [];
  const out: Radio[] = [];
  for (let i = 0; i < c.n; i++) if (ent[i] && url[i]) out.push({ t: c.t[i], entity: ent[i]!, url: url[i]! });
  return out.sort((a, b) => a.t - b.t);
}

function buildOutline(c: Columns | undefined): Outline | null {
  if (!c || c.n === 0) return null;
  const x = parseArray(jsonOf(c, "x")?.[0]);
  const y = parseArray(jsonOf(c, "y")?.[0]);
  if (!x || !y || x.length < 3) return null;
  let d = parseArray(jsonOf(c, "distance_m", "d")?.[0]);
  if (!d || d.length !== x.length) {
    d = [0];
    for (let i = 1; i < x.length; i++) d.push(d[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) / 10);
  }
  const last = x.length - 1;
  const closing = Math.hypot(x[0] - x[last], y[0] - y[last]) / 10;
  return { x: Float64Array.from(x), y: Float64Array.from(y), d: Float64Array.from(d), length: d[last] + closing };
}

function buildCorners(c: Columns | undefined): Corner[] {
  const raw = jsonOf(c, "corners")?.[0];
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = null;
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((o: Record<string, unknown>) => ({
      number: Number(o.number),
      letter: String(o.letter ?? ""),
      d: Number(o.distance_m ?? o.d),
      x: Number(o.x),
      y: Number(o.y),
    }))
    .filter((k) => Number.isFinite(k.number) && Number.isFinite(k.d));
}

export function buildSession(summary: FileSummary, cols: ColMap): SessionModel {
  const map = resolveTopics(summary);
  const get = (role: keyof typeof map.roles) => (map.roles[role] ? cols.get(map.roles[role]!) : undefined);
  const meta = summary.metadata.session ?? {};
  const info = get("info");
  const infoStr = (k: string) => strOf(info, k)?.[0] ?? meta[k] ?? null;
  const kind = sessionKind(infoStr("session_type"), infoStr("session_name"));
  const sessionName = infoStr("session_name") ?? infoStr("session_type") ?? "Session";
  const title = infoStr("event_name") ?? summary.name.replace(/\.mcap$/i, "");
  const circuit = infoStr("circuit_short_name") ?? infoStr("location") ?? "";
  const tzOffsetMin = parseOffset(infoStr("gmt_offset"));
  const epoch0 = Number(BigInt(summary.startNs) / 1000000n) / 1000;

  const entities = buildEntities(get("entities"));
  const events = buildEvents(get("events"));
  const stints = buildStints(get("stints"));
  const pits = buildPits(get("pit"));
  const lc = get("laps");
  const lapInput: LapInput | null = lc
    ? {
        t: lc.t,
        entity: strOf(lc, ...ENTITY_KEYS) ?? [],
        n: numOf(lc, "lap_number", "lap") ?? new Float64Array(lc.n).fill(NaN),
        time: numOf(lc, "lap_time_s", "lap_time") ?? new Float64Array(lc.n).fill(NaN),
        s1: numOf(lc, "sector_1_s", "s1"),
        s2: numOf(lc, "sector_2_s", "s2"),
        s3: numOf(lc, "sector_3_s", "s3"),
        i1: numOf(lc, "intermediate_1_kph"),
        i2: numOf(lc, "intermediate_2_kph"),
        st: numOf(lc, "speed_trap_kph"),
        pitOut: numOf(lc, "is_pit_out_lap", "pit_out"),
      }
    : null;
  let lapSpan: [number, number] | null = null;
  if (lapInput && lapInput.t.length) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < lapInput.t.length; i++) {
      lo = Math.min(lo, lapInput.t[i]);
      hi = Math.max(hi, lapInput.t[i] + (Number.isFinite(lapInput.time[i]) ? lapInput.time[i] : 0));
    }
    lapSpan = [lo, hi];
  }
  const segments = buildSegments(kind, events, lapSpan ?? [0, summary.duration], sessionName);
  const laps = lapInput ? buildLaps(lapInput, { segments, deleted: deletedLaps(events), stints, pits }) : [];
  const lapsByEntity = new Map<string, Lap[]>();
  for (const l of laps) {
    if (!lapsByEntity.has(l.entity)) lapsByEntity.set(l.entity, []);
    lapsByEntity.get(l.entity)!.push(l);
  }
  for (const list of lapsByEntity.values()) list.sort((a, b) => a.n - b.n);
  // Entities that only appear in laps still get a row.
  const entityById = new Map(entities.map((e) => [e.id, e]));
  for (const id of lapsByEntity.keys()) {
    if (!entityById.has(id)) {
      const e: Entity = { id, number: id, code: id, name: id, team: "", colour: "#8D8D8D" };
      entities.push(e);
      entityById.set(id, e);
    }
  }
  const wc = get("weather");
  const weather = wc
    ? { t: wc.t, values: Object.fromEntries(Object.entries(wc.num).filter(([k]) => k !== "t")) }
    : null;
  let raceLaps = 0;
  for (const l of laps) raceLaps = Math.max(raceLaps, l.n);
  const chequered = events.find((e) => e.flag === "CHEQUERED");
  const totalLaps = kind === "race" ? (chequered?.lap ?? raceLaps) || null : null;

  const rc = get("results");
  const dnf = new Set<string>();
  if (rc) {
    const ids = strOf(rc, ...ENTITY_KEYS) ?? [];
    const flag = numOf(rc, "dnf");
    const dns = numOf(rc, "dns");
    for (let i = 0; i < rc.n; i++) if (ids[i] && ((flag?.[i] ?? 0) > 0 || (dns?.[i] ?? 0) > 0)) dnf.add(ids[i]!);
  }

  return {
    dnf,
    fileName: summary.name,
    bytes: summary.bytes,
    kind,
    title,
    sessionName,
    circuit,
    epoch0,
    tzOffsetMin,
    duration: summary.duration,
    window: sessionWindow(segments, summary.duration),
    entities,
    entityById,
    laps,
    lapsByEntity,
    segments,
    events,
    stints,
    pits,
    radio: buildRadio(get("radio")),
    order: buildSeries(get("order"), ["position"]),
    intervals: buildSeries(get("intervals"), ["gap_to_leader_s", "interval_s", "gap_to_leader_laps", "interval_laps"]),
    weather,
    outline: buildOutline(get("outline")),
    corners: buildCorners(get("corners")),
    totalLaps,
    raceLaps,
  };
}

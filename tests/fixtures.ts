import type { Columns, FileSummary, TopicInfo } from "@/data/types";
import { buildSession } from "@/derive/session";
import type { SessionModel } from "@/derive/model";

type Row = Record<string, string | number | null> & { t: number };

/** Columnar topic from plain rows: numbers become Float64Array (NaN for null), the rest strings. */
export function cols(topic: string, rows: Row[]): Columns {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== "t");
  const c: Columns = { topic, n: rows.length, t: Float64Array.from(rows, (r) => r.t), num: {}, str: {}, json: {} };
  for (const k of keys) {
    const vals = rows.map((r) => r[k] ?? null);
    if (vals.every((v) => v == null || typeof v === "number")) c.num[k] = Float64Array.from(vals, (v) => (v == null ? NaN : (v as number)));
    else c.str[k] = vals.map((v) => (v == null ? null : String(v)));
  }
  return c;
}

export function session(sessionType: string, topics: Record<string, Row[]>): SessionModel {
  const map = new Map(Object.entries(topics).map(([name, rows]) => [name, cols(name, rows)]));
  const infos: TopicInfo[] = [...map.keys()].map((name) => ({ name, schema: "json", count: map.get(name)!.n, fields: [], rows: false }));
  const summary: FileSummary = { name: "test.mcap", bytes: 0, startNs: "1700000000000000000", duration: 4000, topics: infos, metadata: { session: { session_type: sessionType, session_name: sessionType } } };
  return buildSession(summary, map);
}

export const DRIVERS: Row[] = [
  { t: 0, driver_number: "1", code: "VER", full_name: "Max Verstappen", team_name: "Red Bull", team_colour: "3671C6" },
  { t: 0, driver_number: "44", code: "HAM", full_name: "Lewis Hamilton", team_name: "Ferrari", team_colour: "E8002D" },
  { t: 0, driver_number: "16", code: "LEC", full_name: "Charles Leclerc", team_name: "Ferrari", team_colour: "E8002D" },
];

const lap = (t: number, d: string, n: number, s: [number, number, number], pitOut = 0): Row => ({
  t,
  driver_number: d,
  lap_number: n,
  lap_time_s: s[0] + s[1] + s[2],
  sector_1_s: s[0],
  sector_2_s: s[1],
  sector_3_s: s[2],
  is_pit_out_lap: pitOut,
});

/**
 * Two-phase qualifying. Q1: HAM 79.5, VER 80, LEC 81 (best S1 of all). Q2: VER 78, HAM 78.4;
 * LEC does not run, so is out in Q1.
 */
export function quali(extraEvents: Row[] = []): SessionModel {
  return session("Qualifying", {
    "/drivers": DRIVERS,
    "/race_control": [
      { t: 50, category: "SessionStatus", message: "SESSION STARTED", qualifying_phase: 1 },
      { t: 1000, category: "SessionStatus", message: "SESSION FINISHED", qualifying_phase: 1 },
      { t: 1200, category: "SessionStatus", message: "SESSION STARTED", qualifying_phase: 2 },
      { t: 2000, category: "SessionStatus", message: "SESSION FINISHED", qualifying_phase: 2 },
      ...extraEvents,
    ],
    "/timing/laps": [
      lap(100, "1", 1, [35, 30, 30], 1),
      lap(195, "1", 2, [26, 27, 27]),
      lap(100, "44", 1, [35, 30, 30], 1),
      lap(195, "44", 2, [26.5, 26.5, 26.5]),
      lap(100, "16", 1, [35, 30, 30], 1),
      lap(195, "16", 2, [25.5, 28, 27.5]),
      lap(1250, "1", 3, [35, 30, 30], 1),
      lap(1345, "1", 4, [26, 26, 26]),
      lap(1250, "44", 3, [35, 30, 30], 1),
      lap(1345, "44", 4, [26.1, 26.1, 26.2]),
    ],
  });
}

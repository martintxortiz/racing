import { describe, expect, it } from "vitest";
import { buildLaps, deletedLaps, buildEvents } from "@/derive/session";
import { buildSegments } from "@/derive/segments";
import { computeBests, lapState, mark, qualiTiming, raceTiming, sectorDoneAt, sectorTable } from "@/derive/timing";
import { statusSpans, trackStatusAt } from "@/derive/status";
import type { RcEvent } from "@/derive/model";
import { cols, DRIVERS, quali, session } from "./fixtures";

const ev = (t: number, message: string, extra: Partial<RcEvent> = {}): RcEvent => ({ t, category: "Other", flag: null, scope: null, sector: null, entity: null, lap: null, phase: null, message, ...extra });

describe("laps", () => {
  it("marks out and in laps, attaches segments and validity", () => {
    const s = quali();
    const ver = s.lapsByEntity.get("1")!;
    expect(ver.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    expect(ver[0].pitOut).toBe(true);
    expect(ver[0].valid).toBe(false);
    // The lap before an out lap is an in lap, so not valid for bests.
    expect(ver[1].pitIn).toBe(true);
    expect(ver[1].valid).toBe(false);
    expect(ver[3].valid).toBe(true);
    // LEC's lap 2 has no out lap after it: a normal timed lap.
    expect(s.lapsByEntity.get("16")![1].valid).toBe(true);
    expect(ver[0].segment).toBe(0);
    expect(ver[3].segment).toBe(1);
    expect(ver[3].t1).toBeCloseTo(1345 + 78);
  });

  it("reads lap deletions from race control and skips reinstated ones", () => {
    const events = [
      ev(300, "CAR 44 (HAM) TIME 1:19.500 DELETED - TRACK LIMITS AT TURN 4 LAP 2 14:05:11"),
      ev(310, "CAR 1 (VER) LAP DELETED - TRACK LIMITS AT TURN 9 LAP 2 14:05:20"),
      ev(320, "CAR 1 (VER) TIME 1:20.000 REINSTATED - LAP 2"),
    ];
    const del = deletedLaps(events);
    expect([...del.get("44")!.keys()]).toEqual([2]);
    expect(del.get("1")?.has(2)).toBe(true);
    const laps = buildLaps(
      { t: [195, 195], entity: ["44", "16"], n: [2, 2], time: [79.5, 81] },
      { segments: [{ id: "S", label: "S", t0: 0, t1: 1000 }], deleted: del },
    );
    expect(laps.find((l) => l.entity === "44")!.deleted).toBe(true);
    expect(laps.find((l) => l.entity === "44")!.valid).toBe(false);
    expect(laps.find((l) => l.entity === "16")!.valid).toBe(true);
  });

  it("falls back to the next lap start when a lap has no time", () => {
    const laps = buildLaps({ t: [0, 90], entity: ["1", "1"], n: [1, 2], time: [NaN, 80] }, { segments: [] });
    expect(laps[0].t1).toBe(90);
    expect(laps[0].valid).toBe(false);
  });

  it("knows sector completion times and the lap in progress", () => {
    const s = quali();
    const l = s.lapsByEntity.get("16")![1];
    expect(sectorDoneAt(l, 0)).toBeCloseTo(195 + 25.5);
    expect(sectorDoneAt(l, 1)).toBeCloseTo(195 + 53.5);
    expect(sectorDoneAt(l, 2)).toBeCloseTo(195 + 81);
    const st = lapState(s.lapsByEntity.get("16"), 230);
    expect(st.last?.n).toBe(1);
    expect(st.live.lap?.n).toBe(2);
    expect(st.live.sectors).toEqual([25.5, null, null]);
  });
});

describe("bests", () => {
  it("only counts what is known at t", () => {
    const s = quali();
    const early = computeBests(s.laps, 230);
    expect(early.lap).toBeNull();
    expect(early.sectors[0]).toBe(25.5);
    // VER and HAM's quicker Q1 laps were in laps; LEC's 81.0 is the only valid one.
    const after = computeBests(s.laps, 300, 0);
    expect(after.lap).toBe(81);
    expect(after.lapRef?.entity).toBe("16");
  });

  it("purple for the session best, green for a personal best", () => {
    expect(mark(25.5, 25.5, 25.5)).toBe("sb");
    expect(mark(26, 26, 25.5)).toBe("pb");
    expect(mark(27, 26, 25.5)).toBeNull();
    expect(mark(null, 26, 25.5)).toBeNull();
  });

  it("picks the fastest valid lap per entity and overall", () => {
    const s = quali();
    const b = computeBests(s.laps, 3000, 1);
    expect(b.lap).toBe(78);
    expect(b.lapRef?.entity).toBe("1");
    expect(b.byEntity.get("44")?.lap).toBeCloseTo(78.4);
    expect(b.sectors).toEqual([26, 26, 26]);
  });
});

describe("qualifying timing and gaps", () => {
  it("orders by best lap in the active phase and puts eliminated drivers below", () => {
    const s = quali();
    const tm = qualiTiming(s, 1500);
    expect(tm.segment).toBe(1);
    expect(tm.rows.map((r) => r.entity.code)).toEqual(["VER", "HAM", "LEC"]);
    expect(tm.rows[0].gap).toBe(0);
    expect(tm.rows[1].gap).toBeCloseTo(0.4);
    expect(tm.rows[1].interval).toBeCloseTo(0.4);
    const lec = tm.rows[2];
    expect(lec.state).toBe("eliminated");
    expect(lec.eliminatedIn).toBe(0);
    expect(lec.pos).toBe(3);
    expect(lec.gap).toBeNull();
  });

  it("has no position before a lap is set", () => {
    const tm = qualiTiming(quali(), 60);
    expect(tm.rows.every((r) => r.pos == null)).toBe(true);
  });
});

describe("sectors and ideal lap", () => {
  it("sums best sectors and reports time lost to the ideal", () => {
    const s = quali();
    const { rows, idealBest } = sectorTable(s, 3000, 1);
    const ver = rows.find((r) => r.entity.code === "VER")!;
    expect(ver.ideal).toBeCloseTo(78);
    expect(ver.loss).toBeCloseTo(0);
    const ham = rows.find((r) => r.entity.code === "HAM")!;
    expect(ham.ideal).toBeCloseTo(78.4);
    expect(idealBest).toBeCloseTo(78);
    expect(rows[0].entity.code).toBe("VER");
  });

  it("drops the out-lap first sector and in-lap last sector from bests", () => {
    const s = quali();
    // VER: lap 1 is an out lap (S1 ignored), lap 2 an in lap (S3 ignored).
    const b = computeBests(s.laps, 3000, 0);
    expect(b.byEntity.get("1")?.sectors).toEqual([26, 27, 30]);
    expect(b.byEntity.get("16")?.sectors).toEqual([25.5, 28, 27.5]);
  });
});

describe("race timing", () => {
  const race = (withIntervals: boolean) =>
    session("Race", {
      "/drivers": DRIVERS,
      "/race_control": [{ t: 10, category: "SessionStatus", message: "SESSION STARTED" }],
      "/timing/laps": [
        { t: 10, driver_number: "1", lap_number: 1, lap_time_s: 90 },
        { t: 100, driver_number: "1", lap_number: 2, lap_time_s: 88 },
        { t: 11, driver_number: "44", lap_number: 1, lap_time_s: 91 },
        { t: 102, driver_number: "44", lap_number: 2, lap_time_s: 87 },
        { t: 12, driver_number: "16", lap_number: 1, lap_time_s: 95 },
        { t: 107, driver_number: "16", lap_number: 2, lap_time_s: 95 },
      ],
      "/timing/positions": [
        { t: 10, driver_number: "1", position: 1 },
        { t: 10, driver_number: "44", position: 2 },
        { t: 10, driver_number: "16", position: 3 },
      ],
      ...(withIntervals
        ? {
            "/timing/intervals": [
              { t: 100, driver_number: "44", gap_to_leader_s: 2, interval_s: 2 },
              { t: 100, driver_number: "16", gap_to_leader_s: 7, interval_s: 5 },
              { t: 188, driver_number: "44", gap_to_leader_s: 1.2, interval_s: 1.2 },
              { t: 188, driver_number: "16", gap_to_leader_s: 14, interval_s: 12.8 },
            ],
          }
        : {}),
    });

  it("orders from the position feed and reads gaps and their trend", () => {
    const tm = raceTiming(race(true), 195);
    expect(tm.rows.map((r) => r.entity.code)).toEqual(["VER", "HAM", "LEC"]);
    const ham = tm.rows[1];
    expect(ham.gap).toBeCloseTo(1.2);
    expect(ham.trend).toBeCloseTo(-0.8); // closing
    expect(tm.rows[2].trend).toBeCloseTo(7.8); // opening
    expect(tm.rows[0].laps).toBe(2);
    expect(tm.bests.lap).toBe(87);
  });

  it("derives gaps from lap crossings when there is no interval feed", () => {
    const tm = raceTiming(race(false), 200);
    const ham = tm.rows.find((r) => r.entity.code === "HAM")!;
    expect(ham.gap).toBeCloseTo(189 - 188);
    const lec = tm.rows.find((r) => r.entity.code === "LEC")!;
    // LEC has finished one lap at t=200, so it is compared at lap 1.
    expect(lec.laps).toBe(1);
    expect(lec.interval).toBeCloseTo(107 - 102);
    expect(lec.lapsDown).toBe(1);
  });
});

describe("segments and track status", () => {
  it("splits qualifying into phases; a missing finish ends at the next start", () => {
    const segs = buildSegments(
      "qualifying",
      [ev(0, "SESSION STARTED", { phase: 1 }), ev(900, "SESSION STARTED", { phase: 2 }), ev(1500, "SESSION FINISHED", { phase: 2 })],
      [0, 2000],
      "Qualifying",
    );
    expect(segs.map((s) => [s.label, s.t0, s.t1])).toEqual([
      ["Q1", 0, 900],
      ["Q2", 900, 1500],
    ]);
  });

  it("tracks yellows by sector, safety car and chequered flag", () => {
    const events = buildEvents(
      cols("/race_control", [
        { t: 0, category: "SessionStatus", message: "SESSION STARTED", flag: null, scope: null, sector: null },
        { t: 10, category: "Flag", message: "YELLOW IN TRACK SECTOR 5", flag: "YELLOW", scope: "Sector", sector: 5 },
        { t: 20, category: "Flag", message: "CLEAR IN TRACK SECTOR 5", flag: "CLEAR", scope: "Sector", sector: 5 },
        { t: 30, category: "SafetyCar", message: "SAFETY CAR DEPLOYED", flag: null, scope: null, sector: null },
        { t: 40, category: "SafetyCar", message: "SAFETY CAR IN THIS LAP", flag: null, scope: null, sector: null },
        { t: 50, category: "Flag", message: "GREEN LIGHT", flag: "GREEN", scope: "Track", sector: null },
        { t: 90, category: "Flag", message: "CHEQUERED FLAG", flag: "CHEQUERED", scope: "Track", sector: null },
      ]),
    );
    expect(trackStatusAt(events, 5).state).toBe("green");
    const y = trackStatusAt(events, 15);
    expect(y.state).toBe("yellow");
    expect(y.yellows).toEqual([{ sector: 5, double: false }]);
    expect(trackStatusAt(events, 25).state).toBe("green");
    expect(trackStatusAt(events, 35).state).toBe("sc");
    expect(trackStatusAt(events, 45).label).toBe("Safety car in this lap");
    expect(trackStatusAt(events, 55).state).toBe("green");
    expect(trackStatusAt(events, 95).state).toBe("chequered");
    const spans = statusSpans(events, 100);
    expect(spans.find((s) => s.state === "sc")).toMatchObject({ t0: 30, t1: 50 });
  });
});

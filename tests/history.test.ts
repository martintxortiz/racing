import { describe, expect, it } from "vitest";
import { raceHistory } from "@/derive/history";
import { DRIVERS, session } from "./fixtures";

/** Lap rows stamped at the lap start (as the feed does), starting at t = 100. */
function laps(d: string, times: number[], pitIn: number | null = null) {
  let t = 100;
  return times.map((lt, i) => {
    const t0 = t;
    t += lt;
    // An in-lap is followed by a pit-out lap.
    return { t: t0, driver_number: d, lap_number: i + 1, lap_time_s: lt, is_pit_out_lap: pitIn != null && i + 1 === pitIn + 1 ? 1 : 0 };
  });
}

describe("race history", () => {
  // VER leads, then pits after lap 3 (+20 s on the out lap). HAM runs a steady 91 s. LEC is slow and gets lapped.
  const s = session("Race", {
    "/drivers": DRIVERS,
    "/race_control": [{ t: 100, category: "SessionStatus", message: "SESSION STARTED" }],
    "/timing/laps": [...laps("1", [90, 90, 90, 110, 90, 90], 3), ...laps("44", [91, 91, 91, 91, 91, 91]), ...laps("16", [100, 100, 100, 100, 100])],
  });
  const h = raceHistory(s);
  const gaps = (id: string) => h.lines.get(id)!.map((p) => p.gap);
  const steps = (id: string) => gaps(id).slice(1).map((g, i) => g - gaps(id)[i]);

  it("uses the car with most laps, then earliest, as the pace reference", () => {
    // HAM finishes six laps in 546 s, VER in 560 s after his stop.
    expect(h.ref).toBe("44");
    expect(h.pace).not.toBeNull();
  });

  it("does not move other cars when the leader pits", () => {
    // HAM's line only moves by his own lap time minus the reference pace: no jump on lap 4.
    const st = steps("44");
    for (const d of st) expect(d).toBeCloseTo(st[0], 6);
  });

  it("shows the stop as a step on the pitting car and marks the pit lap", () => {
    const st = steps("1");
    expect(st[2] - st[1]).toBeCloseTo(20, 6);
    // The marker sits on the in-lap's crossing (pit entry); the time is lost on the out lap.
    expect(h.lines.get("1")!.filter((p) => p.pit).map((p) => p.lap)).toEqual([3]);
  });

  it("compares lapped cars at the same lap count", () => {
    const lec = h.lines.get("16")!;
    expect(lec.map((p) => p.lap)).toEqual([1, 2, 3, 4, 5]);
    // 9 s per lap slower than HAM at every lap.
    lec.forEach((p, i) => expect(p.gap - gaps("44")[i]).toBeCloseTo(9 * (i + 1), 6));
  });

  it("only includes laps finished by the replay time", () => {
    const early = raceHistory(s, 100 + 200);
    expect(early.lines.get("44")!.length).toBe(2);
  });
});

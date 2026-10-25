import { describe, expect, it } from "vitest";
import type { RcEvent } from "@/derive/model";
import { buildPreset, MONITOR, PRESETS, PRESET_REV } from "@/layout/presets";
import { spreadLabels } from "@/widgets/Gaps";
import { fitColumns } from "@/widgets/Tower";
import { bestRotation } from "@/widgets/TrackMap";
import { eventType } from "@/widgets/Events";
import { spread } from "@/widgets/Ladder";
import { compass } from "@/widgets/Session";

const rc = (p: Partial<RcEvent>): RcEvent => ({ t: 0, category: "Other", flag: null, scope: null, sector: null, entity: null, lap: null, phase: null, message: "", ...p });

describe("monitor preset", () => {
  it("puts the Monitor tab first in every preset and stamps the preset revision", () => {
    for (const p of PRESETS) {
      const l = buildPreset(p.id);
      expect(l.tabs[0].name).toBe("Monitor");
      expect(l.rev).toBe(PRESET_REV);
    }
  });
});

describe("lap time distribution labels", () => {
  it("pushes overlapping labels apart and keeps them inside the range", () => {
    const out = spread([10, 10, 10], 12, 0, 100);
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(12);
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(12);
    const top = spread([98, 99, 100], 12, 0, 100);
    expect(top[2]).toBeLessThanOrEqual(100);
    expect(top[0]).toBeLessThanOrEqual(76);
  });
});

describe("race control type", () => {
  it("labels flags with their sector and classifies stewards' messages", () => {
    expect(eventType(rc({ flag: "YELLOW", scope: "Sector", sector: 4 }))).toEqual({ label: "Yellow S4", tone: "flagYellow" });
    expect(eventType(rc({ message: "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 1" })).label).toBe("Penalty");
    expect(eventType(rc({ message: "CAR 4 TRACK LIMITS AT TURN 7" })).label).toBe("Track limits");
  });
});

describe("compass", () => {
  it("maps degrees to 16 points", () => {
    expect(compass(0)).toBe("N");
    expect(compass(90)).toBe("E");
    expect(compass(-45)).toBe("NW");
    expect(compass(359)).toBe("N");
  });
});

describe("monitor proportions", () => {
  it("splits the race Monitor like the Pitwall default: three columns, tower over strategy", () => {
    const l = buildPreset("race");
    const root = l.tabs[0].root;
    if (root?.kind !== "split") throw new Error("Monitor should be split");
    expect(root.dir).toBe("row");
    expect(root.ratio).toBeCloseTo(MONITOR.left, 3);
    const rest = root.b;
    if (rest.kind !== "split") throw new Error("expected mid and right columns");
    expect(rest.ratio).toBeCloseTo(MONITOR.mid, 3);
    const mid = rest.a;
    expect(mid.kind === "split" && mid.dir === "col" && mid.ratio).toBeCloseTo(MONITOR.tower, 3);
  });
});

describe("track map rotation", () => {
  // A long thin oval along x.
  const n = 200;
  const xs = Array.from({ length: n }, (_, i) => 500 * Math.cos((2 * Math.PI * i) / n));
  const ys = Array.from({ length: n }, (_, i) => 80 * Math.sin((2 * Math.PI * i) / n));
  it("stands a horizontal track up in a tall panel", () => {
    expect(Math.abs(bestRotation(xs, ys, 200, 600))).toBeGreaterThan(60);
  });
  it("leaves it flat in a wide panel", () => {
    expect(Math.abs(bestRotation(xs, ys, 600, 200))).toBeLessThan(30);
    expect(bestRotation(xs, ys, 1100, 220)).toBe(0);
  });
});

describe("ranking tower columns", () => {
  const cols = [
    { id: "pos", width: 32 },
    { id: "driver", width: 60 },
    { id: "gap", width: 100 },
    { id: "int", width: 84 },
    { id: "dlap", width: 64 },
    { id: "s1", width: 62 },
  ];
  it("keeps every column when there is room", () => {
    expect(fitColumns(cols, 1000).dropped).toHaveLength(0);
  });
  it("drops the least useful columns first, never shrinking the rest", () => {
    const { cols: kept, dropped } = fitColumns(cols, 300);
    expect(dropped.map((c) => c.id)).toEqual(["dlap", "s1"]);
    expect(kept.every((c) => cols.find((x) => x.id === c.id)!.width === c.width)).toBe(true);
  });
});

describe("race trace end labels", () => {
  it("spreads touching labels and keeps A and B when space runs out", () => {
    const items = [0, 1, 2, 3].map((i) => ({ y: 50, hot: i === 3, id: i }));
    const out = spreadLabels(items, 0, 100, 14);
    const ys = out.map((x) => x.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(14);
    const tight = spreadLabels(items, 0, 30, 14);
    expect(tight).toHaveLength(2);
    expect(tight.some((x) => x.hot)).toBe(true);
  });
});

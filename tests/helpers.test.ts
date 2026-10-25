import { describe, expect, it } from "vitest";
import { sentenceCase } from "@/data/text";
import { fitColumns, WIDTH } from "@/widgets/fit";
import { clockTicks } from "@/ui/clock";
import { quali } from "./fixtures";

describe("race control text", () => {
  it("sentence-cases capitals but keeps codes, sectors and abbreviations", () => {
    expect(sentenceCase("FIA STEWARDS: TURN 5 INCIDENT INVOLVING CARS 27 (HUL) AND 55 (SAI) NOTED")).toBe(
      "FIA stewards: turn 5 incident involving cars 27 (HUL) and 55 (SAI) noted",
    );
    expect(sentenceCase("VSC DEPLOYED")).toBe("VSC deployed");
    expect(sentenceCase("Already mixed Case")).toBe("Already mixed Case");
  });
});

describe("timing columns", () => {
  const all = Object.keys(WIDTH).map((id) => ({ id }));
  it("keeps every column when there is room", () => {
    expect(fitColumns(all, 5000, "race").dropped).toEqual([]);
  });
  it("drops low-priority columns first and never the driver", () => {
    const narrow = fitColumns(all, 520, "race");
    expect(narrow.dropped[0]).toBe("st");
    expect(narrow.cols.map((c) => c.id)).toContain("driver");
    expect(narrow.cols.map((c) => c.id)).toContain("gap");
    const q = fitColumns(all, 520, "qualifying");
    expect(q.cols.map((c) => c.id)).toContain("best");
  });
});

describe("clock ticks", () => {
  it("land on round wall-clock minutes", () => {
    const s = quali();
    const ticks = clockTicks(s, 0, 3600, "utc", 6);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    for (const t of ticks) expect(Math.round((s.epoch0 + t) % 600)).toBe(0);
  });
});

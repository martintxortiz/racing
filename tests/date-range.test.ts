import { describe, expect, it } from "vitest";

import {
  formatRange,
  matchesRange,
  mergeDate,
  mergeTime,
  monthCells,
  presetRange,
  startOfDay,
} from "../lib/date-range";

describe("presetRange", () => {
  const now = new Date(2026, 9, 20, 12, 0);

  it("runs rolling windows up to now", () => {
    expect(presetRange("24h", now)).toEqual({
      from: now.getTime() - 24 * 3_600_000,
      to: now.getTime(),
    });
  });

  it("steps calendar months back", () => {
    expect(presetRange("3m", now).from).toBe(
      new Date(2026, 6, 20, 12, 0).getTime(),
    );
  });
});

describe("monthCells", () => {
  it("starts on a Sunday and fills six weeks", () => {
    const cells = monthCells(new Date(2026, 9, 1));
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual(new Date(2026, 8, 27));
    expect(cells[41]).toEqual(new Date(2026, 10, 7));
  });
});

describe("input helpers", () => {
  const value = new Date(2026, 9, 15, 13, 30).getTime();

  it("keeps the time when the date changes", () => {
    expect(mergeDate(value, "2026-10-18")).toBe(
      new Date(2026, 9, 18, 13, 30).getTime(),
    );
  });

  it("keeps the date when the time changes", () => {
    expect(mergeTime(value, "08:05")).toBe(
      new Date(2026, 9, 15, 8, 5).getTime(),
    );
  });
});

describe("range matching", () => {
  const day = new Date(2026, 9, 15, 10, 0).getTime();
  const range = { from: startOfDay(new Date(day)), to: day + 60_000 };

  it("includes rows inside the range only", () => {
    expect(matchesRange(range, new Date(day).toISOString())).toBe(true);
    expect(matchesRange(range, new Date(day + 120_000).toISOString())).toBe(
      false,
    );
    expect(matchesRange(null, "not a date")).toBe(true);
  });

  it("formats a single day once", () => {
    const label = formatRange({ from: day, to: day + 3_600_000 });
    expect(label).not.toContain("–");
    expect(formatRange({ from: day, to: day + 86_400_000 })).toContain("–");
  });
});

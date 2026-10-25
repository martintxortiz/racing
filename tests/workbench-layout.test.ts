import { describe, expect, it } from "vitest";

import {
  defaultQualiLayout,
  insertAt,
  movePanel,
  panelIds,
  prune,
  removePanel,
  resolveBinding,
  setSplit,
  validateLayout,
  type LayoutNode,
} from "../lib/workbench/layout";

const overview = defaultQualiLayout().tabs[0].root as LayoutNode;

describe("layout tree", () => {
  it("default layout is valid and matches the spec order", () => {
    expect(validateLayout(defaultQualiLayout())).toBeNull();
    expect(panelIds(overview)).toEqual(["timing", "trace", "map", "laps", "log"]);
  });

  it("removing a panel promotes its sibling", () => {
    const n = removePanel(overview, "map");
    expect(panelIds(n)).toEqual(["timing", "trace", "laps", "log"]);
    expect(removePanel("solo", "solo")).toBeNull();
  });

  it("inserts on an edge of the target", () => {
    const n = insertAt(overview, "log", "new", "right");
    expect(panelIds(n)).toEqual(["timing", "trace", "map", "laps", "log", "new"]);
    expect(insertAt(null, null, "first", "right")).toBe("first");
    expect(insertAt("a", "a", "b", "top")).toEqual({ direction: "column", splitPercentage: 50, first: "b", second: "a" });
  });

  it("moves a panel next to another", () => {
    const n = movePanel(overview, "timing", "log", "bottom");
    expect(panelIds(n)).toEqual(["trace", "map", "laps", "log", "timing"]);
    expect(movePanel(overview, "map", "map", "left")).toBe(overview);
  });

  it("clamps split percentages", () => {
    const n = setSplit(overview, ["second"], 120);
    expect((n as { second: { splitPercentage: number } }).second.splitPercentage).toBe(95);
  });

  it("rejects broken layouts and prunes unused panels", () => {
    expect(validateLayout({ version: 2 })).toMatch(/version/);
    const l = defaultQualiLayout();
    l.tabs[0].root = "ghost";
    expect(validateLayout(l)).toMatch(/ghost/);
    const p = prune({ ...defaultQualiLayout(), tabs: [defaultQualiLayout().tabs[1]] });
    expect(Object.keys(p.panels).sort()).toEqual(["laps2", "map2", "trace2"]);
  });

  it("resolves A/B tokens", () => {
    expect(resolveBinding("/vehicle/{A}/telemetry", { a: "12", b: null })).toBe("/vehicle/12/telemetry");
    expect(resolveBinding("/vehicle/{B}/telemetry", { a: "12", b: null })).toBeNull();
    expect(resolveBinding("/vehicle/*/pose", { a: null, b: null })).toBe("/vehicle/*/pose");
  });
});

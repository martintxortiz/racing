import { describe, expect, it, vi } from "vitest";
import { entityMenu, entityTitle, panelMenu, tabMenu, type EntityMenuCtx } from "@/menus/build";
import { sep, tidy, type MenuItem } from "@/menus/types";
import { quali } from "./fixtures";

type Item = Extract<MenuItem, { run: () => void }>;
type Sub = Extract<MenuItem, { kind: "sub" }>;
const byId = (items: MenuItem[], id: string) => items.find((i): i is Item => "run" in i && i.id === id);
const subOf = (items: MenuItem[], id: string) => items.find((i): i is Sub => i.kind === "sub" && i.id === id)!;
const noop = () => {};

describe("menu helpers", () => {
  it("tidies separators", () => {
    const a: MenuItem = { id: "a", label: "A", run: noop };
    expect(tidy([sep, a, sep, sep, a, sep])).toEqual([a, sep, a]);
    expect(tidy([sep])).toEqual([]);
  });
});

describe("tab menu", () => {
  const act = { rename: vi.fn(), duplicate: vi.fn(), close: vi.fn(), closeOthers: vi.fn(), moveLeft: vi.fn(), moveRight: vi.fn(), addPanel: vi.fn(), newTab: vi.fn() };
  it("disables moves at the ends and close-others with one tab", () => {
    const first = tabMenu({ index: 0, count: 1, act });
    expect(byId(first, "move-left")!.disabled).toBe(true);
    expect(byId(first, "move-right")!.disabled).toBe(true);
    expect(byId(first, "close-others")!.disabled).toBe(true);
    const mid = tabMenu({ index: 1, count: 3, act });
    expect(byId(mid, "move-left")!.disabled).toBe(false);
  });
  it("runs the chosen action", () => {
    const m = tabMenu({ index: 0, count: 2, act });
    byId(m, "close")!.run();
    expect(act.close).toHaveBeenCalledOnce();
  });
});

describe("panel menu", () => {
  it("offers split, change widget by group, move to tab and remove", () => {
    const act = { split: vi.fn(), replace: vi.fn(), moveToTab: vi.fn(), moveToNewTab: vi.fn(), duplicate: vi.fn(), maximize: vi.fn(), rename: vi.fn(), remove: vi.fn() };
    const m = panelMenu({
      widgets: [
        { type: "timing", name: "Timing", group: "Timing" },
        { type: "map", name: "Track map", group: "Track" },
      ],
      currentType: "timing",
      tabs: [
        { id: "t1", name: "Overview" },
        { id: "t2", name: "Compare" },
      ],
      currentTab: "t1",
      maximized: false,
      settings: [],
      act,
    });
    const change = subOf(m, "replace");
    expect(change.items.filter((i) => i.kind === "label").map((i) => (i as { label: string }).label)).toEqual(["Timing", "Track"]);
    expect(byId(change.items, "replace:timing")!.checked).toBe(true);
    const move = subOf(m, "move");
    expect(byId(move.items, "move:t1")!.disabled).toBe(true);
    byId(m, "split-down")!.run();
    expect(act.split).toHaveBeenCalledWith("bottom");
    byId(change.items, "replace:map")!.run();
    expect(act.replace).toHaveBeenCalledWith("map");
    expect(byId(m, "remove")!.danger).toBe(true);
  });
});

describe("entity menu", () => {
  const s = quali();
  const ver = s.entityById.get("1")!;
  const make = (focus: string | null, compare: string | null): [MenuItem[], EntityMenuCtx["act"]] => {
    const act = { focus: vi.fn(), compare: vi.fn(), clearCompare: vi.fn(), swap: vi.fn(), jump: vi.fn() };
    const laps = s.lapsByEntity.get("1")!;
    return [entityMenu({ entity: ver, focus, compare, laps, bestLap: laps[3], act }), act];
  };

  it("sets focus and compare and lists laps with tags, newest first", () => {
    const [m, act] = make(null, null);
    expect(byId(m, "swap")).toBeUndefined();
    expect(byId(m, "clear")).toBeUndefined();
    const laps = subOf(m, "compare-lap").items.filter((i): i is Item => "run" in i);
    expect(laps.map((i) => i.label)).toEqual(["Personal best", "Lap 4", "Lap 3 out", "Lap 2 in", "Lap 1 out"]);
    laps[1].run();
    expect(act.compare).toHaveBeenCalledWith(4);
    byId(m, "jump-best")!.run();
    expect(act.jump).toHaveBeenCalledWith(1345 + 78);
  });

  it("adds swap and clear once a pair is chosen", () => {
    const [m] = make("44", "1");
    expect(byId(m, "compare")?.checked).toBe(true);
    expect(byId(m, "swap")).toBeDefined();
    expect(byId(m, "clear")).toBeDefined();
    expect(byId(m, "compare")?.label).toBe("Compare with focus (B)");
  });

  it("titles with number, name and team", () => {
    expect(entityTitle(ver)).toBe("#1 · Max Verstappen · Red Bull");
  });
});

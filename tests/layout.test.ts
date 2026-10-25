import { describe, expect, it } from "vitest";
import {
  addPanel,
  addTab,
  closePanel,
  closeTab,
  duplicateTab,
  equalize,
  insertPanel,
  leaf,
  movePanel,
  movePanelToTab,
  moveTab,
  nextTabName,
  normalize,
  panelIds,
  parseLayout,
  removePanel,
  renameTab,
  setRatio,
  split,
  swapPanels,
  type Layout,
} from "@/layout/model";
import { computeGeometry } from "@/layout/geometry";
import { buildPreset, PRESETS, presetFor } from "@/layout/presets";

const empty = (): Layout => ({ id: "l", name: "Test", version: 1, tabs: [{ id: "t1", name: "Tab 1", root: null }], panels: {} });

describe("layout tree", () => {
  it("splits on the requested side and removes back to the sibling", () => {
    let root = insertPanel(null, null, "a");
    expect(root).toEqual(leaf("a"));
    root = insertPanel(root, "a", "b", "right");
    expect(root).toMatchObject({ kind: "split", dir: "row", a: leaf("a"), b: leaf("b") });
    root = insertPanel(root, "b", "c", "top");
    expect(panelIds(root)).toEqual(["a", "c", "b"]);
    expect(removePanel(removePanel(root, "c"), "b")).toEqual(leaf("a"));
  });

  it("swaps and moves panels without losing any", () => {
    const root = split("row", leaf("a"), split("col", leaf("b"), leaf("c")));
    expect(panelIds(swapPanels(root, "a", "c"))).toEqual(["c", "b", "a"]);
    const moved = movePanel(root, "a", "c", "bottom");
    expect(panelIds(moved).sort()).toEqual(["a", "b", "c"]);
    expect(panelIds(moved)).toEqual(["b", "c", "a"]);
    expect(movePanel(root, "a", "a", "left")).toBe(root);
  });

  it("clamps resize ratios and evens out runs of splits", () => {
    const root = split("row", leaf("a"), split("row", leaf("b"), leaf("c")), 0.5);
    const r = setRatio(root, [], 0.99)!;
    expect(r.kind === "split" && r.ratio).toBe(0.92);
    const eq = equalize(root)!;
    expect(eq.kind === "split" && eq.ratio).toBeCloseTo(1 / 3);
  });

  it("computes non-overlapping rects that fill the box", () => {
    const root = split("row", leaf("a"), split("col", leaf("b"), leaf("c")), 0.5);
    const { panels, splitters } = computeGeometry(root, { x: 0, y: 0, w: 1004, h: 604 }, 4);
    expect(panels.size).toBe(3);
    expect(splitters.length).toBe(2);
    const a = panels.get("a")!;
    const b = panels.get("b")!;
    expect(a.x + a.w).toBeLessThanOrEqual(b.x);
    const area = [...panels.values()].reduce((s, p) => s + p.w * p.h, 0);
    expect(area).toBeGreaterThan(1004 * 604 * 0.98);
  });
});

describe("tabs and panels", () => {
  it("adds, renames, reorders and closes tabs, always keeping one", () => {
    let l = empty();
    expect(nextTabName(l)).toBe("Tab 2");
    const added = addTab(l);
    l = added.layout;
    expect(l.tabs.map((t) => t.name)).toEqual(["Tab 1", "Tab 2"]);
    l = renameTab(l, added.tabId, "  Race  ");
    expect(l.tabs[1].name).toBe("Race");
    expect(renameTab(l, added.tabId, "   ")).toBe(l);
    l = moveTab(l, 1, 0);
    expect(l.tabs.map((t) => t.name)).toEqual(["Race", "Tab 1"]);
    l = closeTab(closeTab(l, l.tabs[0].id), l.tabs[1].id);
    expect(l.tabs).toHaveLength(1);
  });

  it("adds and closes panels and drops their state", () => {
    let l = empty();
    const a = addPanel(l, "t1", { type: "timing", config: {} });
    const b = addPanel(a.layout, "t1", { type: "map", config: {} }, a.panelId, "bottom");
    l = b.layout;
    expect(panelIds(l.tabs[0].root)).toEqual([a.panelId, b.panelId]);
    l = closePanel(l, a.panelId);
    expect(l.panels[a.panelId]).toBeUndefined();
    expect(l.tabs[0].root).toEqual(leaf(b.panelId));
  });

  it("duplicates a tab with fresh panel ids and copied config", () => {
    const a = addPanel(empty(), "t1", { type: "timing", config: { compact: true } });
    const d = duplicateTab(a.layout, "t1");
    const ids = panelIds(d.layout.tabs[1].root);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(a.panelId);
    expect(d.layout.panels[ids[0]]).toMatchObject({ type: "timing", config: { compact: true } });
    expect(d.layout.tabs[1].name).toBe("Tab 1 copy");
  });

  it("moves a panel to another tab", () => {
    const a = addPanel(empty(), "t1", { type: "timing", config: {} });
    const t = addTab(a.layout);
    const l = movePanelToTab(t.layout, a.panelId, t.tabId);
    expect(l.tabs[0].root).toBeNull();
    expect(panelIds(l.tabs[1].root)).toEqual([a.panelId]);
  });

  it("normalises orphans and rejects junk on import", () => {
    const l = { ...empty(), panels: { ghost: { id: "ghost", type: "map", config: {} } }, tabs: [{ id: "t1", name: "Tab 1", root: split("row", leaf("ghost"), leaf("missing")) }] } as Layout;
    const n = normalize(l);
    expect(n.tabs[0].root).toEqual(leaf("ghost"));
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout({ tabs: "x", panels: {} })).toBeNull();
    expect(parseLayout({ tabs: [{ id: "t", name: "T", root: { kind: "split", dir: "diagonal" } }], panels: {} })).toBeNull();
  });
});

describe("presets", () => {
  it("every preset is a set of tabs whose panels all exist", () => {
    for (const p of PRESETS) {
      const l = buildPreset(p.id);
      expect(l.tabs.length).toBeGreaterThanOrEqual(3);
      const used = l.tabs.flatMap((t) => panelIds(t.root));
      expect(used.length).toBeGreaterThan(0);
      for (const id of used) expect(l.panels[id]?.type).toBeTruthy();
      expect(Object.keys(l.panels).sort()).toEqual([...used].sort());
    }
  });

  it("maps session kinds to presets", () => {
    expect(presetFor("race").id).toBe("preset:race");
    expect(presetFor("qualifying").id).toBe("preset:qualifying");
    expect(presetFor("practice").id).toBe("preset:practice");
  });
});

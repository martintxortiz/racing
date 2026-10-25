/**
 * Workspace layout: tabs hold a binary split tree whose leaves are panels. All operations are
 * pure and return new objects.
 */

export type Dir = "row" | "col";
export type Side = "left" | "right" | "top" | "bottom";

export type LayoutNode = { kind: "panel"; id: string } | { kind: "split"; dir: Dir; ratio: number; a: LayoutNode; b: LayoutNode };

export interface PanelState {
  id: string;
  type: string;
  title?: string;
  config: Record<string, unknown>;
}

export interface Tab {
  id: string;
  name: string;
  root: LayoutNode | null;
}

export interface Layout {
  id: string;
  name: string;
  version: 1;
  tabs: Tab[];
  panels: Record<string, PanelState>;
  /** Preset the layout was created from, if any. */
  preset?: string;
  /** Preset revision a built-in layout was built from; older saved copies are replaced on load. */
  rev?: number;
}

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const leaf = (id: string): LayoutNode => ({ kind: "panel", id });
export const split = (dir: Dir, a: LayoutNode, b: LayoutNode, ratio = 0.5): LayoutNode => ({ kind: "split", dir, ratio, a, b });

export function panelIds(node: LayoutNode | null): string[] {
  if (!node) return [];
  if (node.kind === "panel") return [node.id];
  return [...panelIds(node.a), ...panelIds(node.b)];
}

export function contains(node: LayoutNode | null, id: string): boolean {
  return panelIds(node).includes(id);
}

/** Put `newId` next to `targetId` on the given side. With no tree, the new panel is the root. */
export function insertPanel(root: LayoutNode | null, targetId: string | null, newId: string, side: Side = "right", ratio = 0.5): LayoutNode {
  const add = leaf(newId);
  if (!root) return add;
  const dir: Dir = side === "left" || side === "right" ? "row" : "col";
  const first = side === "left" || side === "top";
  const wrap = (n: LayoutNode): LayoutNode => (first ? split(dir, add, n, 1 - ratio) : split(dir, n, add, ratio));
  if (!targetId || !contains(root, targetId)) return wrap(root);
  const walk = (n: LayoutNode): LayoutNode => {
    if (n.kind === "panel") return n.id === targetId ? wrap(n) : n;
    return { ...n, a: walk(n.a), b: walk(n.b) };
  };
  return walk(root);
}

/** Remove a panel; its sibling takes the parent's place. */
export function removePanel(root: LayoutNode | null, id: string): LayoutNode | null {
  if (!root) return null;
  if (root.kind === "panel") return root.id === id ? null : root;
  const a = removePanel(root.a, id);
  const b = removePanel(root.b, id);
  if (!a) return b;
  if (!b) return a;
  return { ...root, a, b };
}

export function swapPanels(root: LayoutNode | null, x: string, y: string): LayoutNode | null {
  if (!root || x === y) return root;
  const walk = (n: LayoutNode): LayoutNode => {
    if (n.kind === "panel") return n.id === x ? leaf(y) : n.id === y ? leaf(x) : n;
    return { ...n, a: walk(n.a), b: walk(n.b) };
  };
  return walk(root);
}

/** Move a panel next to another one (drag to an edge drop zone). */
export function movePanel(root: LayoutNode | null, id: string, targetId: string, side: Side): LayoutNode | null {
  if (!root || id === targetId || !contains(root, id) || !contains(root, targetId)) return root;
  return insertPanel(removePanel(root, id), targetId, id, side);
}

export type Path = ("a" | "b")[];

export function setRatio(root: LayoutNode | null, path: Path, ratio: number): LayoutNode | null {
  if (!root) return root;
  const r = Math.min(0.92, Math.max(0.08, ratio));
  const walk = (n: LayoutNode, depth: number): LayoutNode => {
    if (n.kind !== "split") return n;
    if (depth === path.length) return { ...n, ratio: r };
    const k = path[depth];
    return { ...n, [k]: walk(n[k], depth + 1) };
  };
  return walk(root, 0);
}

export function nodeAt(root: LayoutNode | null, path: Path): LayoutNode | null {
  let n = root;
  for (const k of path) {
    if (!n || n.kind !== "split") return null;
    n = n[k];
  }
  return n;
}

/** Even out splits so panels in a run of same-direction splits get equal space. */
export function equalize(root: LayoutNode | null): LayoutNode | null {
  if (!root || root.kind === "panel") return root;
  const run = (n: LayoutNode, dir: Dir): number => (n.kind === "split" && n.dir === dir ? run(n.a, dir) + run(n.b, dir) : 1);
  const ca = run(root.a, root.dir);
  const cb = run(root.b, root.dir);
  return { ...root, ratio: ca / (ca + cb), a: equalize(root.a)!, b: equalize(root.b)! };
}

// ---- Layout-level operations ----

export function addTab(l: Layout, name?: string, at?: number): { layout: Layout; tabId: string } {
  const id = uid("t");
  const tab: Tab = { id, name: name ?? nextTabName(l), root: null };
  const tabs = [...l.tabs];
  tabs.splice(at ?? tabs.length, 0, tab);
  return { layout: { ...l, tabs }, tabId: id };
}

export function nextTabName(l: Layout): string {
  const names = new Set(l.tabs.map((t) => t.name));
  for (let i = 1; ; i++) if (!names.has(`Tab ${i}`)) return `Tab ${i}`;
}

export function renameTab(l: Layout, tabId: string, name: string): Layout {
  const n = name.trim();
  if (!n) return l;
  return { ...l, tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, name: n } : t)) };
}

/** Close a tab and drop its panels. A layout always keeps one tab. */
export function closeTab(l: Layout, tabId: string): Layout {
  const tab = l.tabs.find((t) => t.id === tabId);
  if (!tab) return l;
  const panels = { ...l.panels };
  for (const id of panelIds(tab.root)) delete panels[id];
  let tabs = l.tabs.filter((t) => t.id !== tabId);
  if (!tabs.length) tabs = [{ id: uid("t"), name: "Tab 1", root: null }];
  return { ...l, tabs, panels };
}

export function moveTab(l: Layout, from: number, to: number): Layout {
  if (from === to || from < 0 || from >= l.tabs.length) return l;
  const tabs = [...l.tabs];
  const [t] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(tabs.length, to)), 0, t);
  return { ...l, tabs };
}

function cloneTree(n: LayoutNode | null, ids: Map<string, string>): LayoutNode | null {
  if (!n) return null;
  if (n.kind === "panel") {
    const id = uid("p");
    ids.set(n.id, id);
    return leaf(id);
  }
  return { ...n, a: cloneTree(n.a, ids)!, b: cloneTree(n.b, ids)! };
}

export function duplicateTab(l: Layout, tabId: string): { layout: Layout; tabId: string } {
  const i = l.tabs.findIndex((t) => t.id === tabId);
  if (i < 0) return { layout: l, tabId };
  const src = l.tabs[i];
  const ids = new Map<string, string>();
  const root = cloneTree(src.root, ids);
  const panels = { ...l.panels };
  for (const [o, n] of ids) panels[n] = { ...structuredClone(l.panels[o]), id: n };
  const id = uid("t");
  const tabs = [...l.tabs];
  tabs.splice(i + 1, 0, { id, name: `${src.name} copy`, root });
  return { layout: { ...l, tabs, panels }, tabId: id };
}

export function tabOf(l: Layout, panelId: string): Tab | undefined {
  return l.tabs.find((t) => contains(t.root, panelId));
}

export function updateTabRoot(l: Layout, tabId: string, fn: (root: LayoutNode | null) => LayoutNode | null): Layout {
  return { ...l, tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, root: fn(t.root) } : t)) };
}

export function addPanel(
  l: Layout,
  tabId: string,
  panel: Omit<PanelState, "id">,
  target: string | null = null,
  side: Side = "right",
): { layout: Layout; panelId: string } {
  const id = uid("p");
  const next = updateTabRoot(l, tabId, (root) => insertPanel(root, target, id, side));
  return { layout: { ...next, panels: { ...next.panels, [id]: { ...panel, id } } }, panelId: id };
}

export function closePanel(l: Layout, panelId: string): Layout {
  const tab = tabOf(l, panelId);
  if (!tab) return l;
  const next = updateTabRoot(l, tab.id, (root) => removePanel(root, panelId));
  const panels = { ...next.panels };
  delete panels[panelId];
  return { ...next, panels };
}

export function updatePanel(l: Layout, panelId: string, patch: Partial<Omit<PanelState, "id">>): Layout {
  const p = l.panels[panelId];
  if (!p) return l;
  return { ...l, panels: { ...l.panels, [panelId]: { ...p, ...patch, config: patch.config ?? p.config } } };
}

export function movePanelToTab(l: Layout, panelId: string, tabId: string): Layout {
  const from = tabOf(l, panelId);
  if (!from || from.id === tabId) return l;
  let next = updateTabRoot(l, from.id, (r) => removePanel(r, panelId));
  next = updateTabRoot(next, tabId, (r) => insertPanel(r, null, panelId, "right"));
  return next;
}

/** Drop panels no tab references and tabs pointing at missing panels. */
export function normalize(l: Layout): Layout {
  const used = new Set(l.tabs.flatMap((t) => panelIds(t.root)));
  const panels: Record<string, PanelState> = {};
  for (const id of used) if (l.panels[id]) panels[id] = l.panels[id];
  const prune = (n: LayoutNode | null): LayoutNode | null => {
    if (!n) return null;
    if (n.kind === "panel") return panels[n.id] ? n : null;
    const a = prune(n.a);
    const b = prune(n.b);
    if (!a) return b;
    if (!b) return a;
    return { ...n, a, b };
  };
  const tabs = l.tabs.map((t) => ({ ...t, root: prune(t.root) }));
  return { ...l, tabs: tabs.length ? tabs : [{ id: uid("t"), name: "Tab 1", root: null }], panels };
}

/** Parse imported JSON. Returns null when it is not a layout. */
export function parseLayout(v: unknown): Layout | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<Layout>;
  if (!Array.isArray(o.tabs) || !o.panels || typeof o.panels !== "object") return null;
  const okNode = (n: unknown): boolean => {
    if (n == null) return true;
    const x = n as LayoutNode;
    if (x.kind === "panel") return typeof x.id === "string";
    if (x.kind === "split") return (x.dir === "row" || x.dir === "col") && typeof x.ratio === "number" && okNode(x.a) && okNode(x.b);
    return false;
  };
  for (const t of o.tabs) if (!t || typeof t.id !== "string" || typeof t.name !== "string" || !okNode(t.root)) return null;
  return normalize({ id: typeof o.id === "string" ? o.id : uid("l"), name: typeof o.name === "string" ? o.name : "Imported", version: 1, tabs: o.tabs, panels: o.panels, preset: o.preset, ...(typeof o.rev === "number" ? { rev: o.rev } : {}) });
}

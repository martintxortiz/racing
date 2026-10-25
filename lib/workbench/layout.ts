// Layout model: tabs of binary split trees over panel ids (spec "Layout JSON", version 1).
// Pure functions only, so they are easy to test and to undo.

export type Direction = "row" | "column";
export type Split = { direction: Direction; splitPercentage?: number; first: LayoutNode; second: LayoutNode };
export type LayoutNode = string | Split;
export type Edge = "left" | "right" | "top" | "bottom";
export type Path = ("first" | "second")[];

export interface PanelState {
  type: string;
  title?: string;
  bindings: Record<string, string>;
  config: Record<string, unknown>;
}
export interface Tab {
  id: string;
  name: string;
  /** null = empty tab (shows the "add a panel" hint). */
  root: LayoutNode | null;
}
export interface Layout {
  version: 1;
  id: string;
  name: string;
  appliesTo?: { kinds?: string[] };
  links?: { cursor?: "global"; selection?: "global" };
  tabs: Tab[];
  panels: Record<string, PanelState>;
}

export const isSplit = (n: LayoutNode | null): n is Split => typeof n === "object" && n !== null;

export function panelIds(n: LayoutNode | null): string[] {
  if (n === null) return [];
  return isSplit(n) ? [...panelIds(n.first), ...panelIds(n.second)] : [n];
}

export function nodeAt(n: LayoutNode, path: Path): LayoutNode {
  return path.reduce<LayoutNode>((acc, k) => (isSplit(acc) ? acc[k] : acc), n);
}

function update(n: LayoutNode, path: Path, f: (n: LayoutNode) => LayoutNode): LayoutNode {
  if (path.length === 0) return f(n);
  if (!isSplit(n)) return n;
  const [k, ...rest] = path;
  return { ...n, [k]: update(n[k], rest, f) };
}

/** Remove a panel; its sibling takes the parent's place. */
export function removePanel(n: LayoutNode | null, id: string): LayoutNode | null {
  if (n === null || n === id) return null;
  if (!isSplit(n)) return n;
  const first = removePanel(n.first, id);
  const second = removePanel(n.second, id);
  if (first === null) return second;
  if (second === null) return first;
  return first === n.first && second === n.second ? n : { ...n, first, second };
}

export function replacePanel(n: LayoutNode | null, id: string, next: LayoutNode): LayoutNode | null {
  if (n === null) return null;
  if (n === id) return next;
  if (!isSplit(n)) return n;
  return { ...n, first: replacePanel(n.first, id, next)!, second: replacePanel(n.second, id, next)! };
}

/** Put `newId` on the given edge of `target` (half of its space). */
export function insertAt(n: LayoutNode | null, target: string | null, newId: string, edge: Edge): LayoutNode {
  if (n === null || target === null || !panelIds(n).includes(target)) {
    if (n === null) return newId;
    return wrap(n, newId, edge);
  }
  return replacePanel(n, target, wrap(target, newId, edge))!;
}

function wrap(existing: LayoutNode, newId: string, edge: Edge): Split {
  const direction: Direction = edge === "left" || edge === "right" ? "row" : "column";
  const before = edge === "left" || edge === "top";
  return before
    ? { direction, splitPercentage: 50, first: newId, second: existing }
    : { direction, splitPercentage: 50, first: existing, second: newId };
}

/** Drag a panel onto another panel's edge. */
export function movePanel(n: LayoutNode | null, id: string, target: string, edge: Edge): LayoutNode | null {
  if (id === target || n === null) return n;
  return insertAt(removePanel(n, id), target, id, edge);
}

export function setSplit(n: LayoutNode, path: Path, pct: number): LayoutNode {
  const p = Math.min(95, Math.max(5, pct));
  return update(n, path, (s) => (isSplit(s) ? { ...s, splitPercentage: p } : s));
}

/** Short random id with a readable prefix. */
export function newId(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  for (let i = 1; ; i++) {
    const id = `${prefix}-${i}`;
    if (!set.has(id)) return id;
  }
}

/** Validate an imported layout (the parts the app relies on). Returns an error message or null. */
export function validateLayout(x: unknown): string | null {
  const l = x as Layout;
  if (!l || typeof l !== "object") return "Not a JSON object.";
  if (l.version !== 1) return "Unsupported layout version (expected 1).";
  if (typeof l.id !== "string" || !/^[a-z0-9-]+$/.test(l.id)) return "Layout id must match ^[a-z0-9-]+$.";
  if (typeof l.name !== "string") return "Layout name is missing.";
  if (!Array.isArray(l.tabs) || l.tabs.length === 0) return "A layout needs at least one tab.";
  if (!l.panels || typeof l.panels !== "object") return "Layout panels are missing.";
  const checkNode = (n: unknown): string | null => {
    if (typeof n === "string") return l.panels[n] ? null : `Tab references unknown panel "${n}".`;
    if (n === null) return null;
    const s = n as Split;
    if (!s || (s.direction !== "row" && s.direction !== "column")) return "Split nodes need direction row or column.";
    return checkNode(s.first) ?? checkNode(s.second);
  };
  for (const t of l.tabs) {
    if (typeof t.id !== "string" || typeof t.name !== "string") return "Every tab needs an id and a name.";
    const e = checkNode(t.root);
    if (e) return e;
  }
  for (const [id, p] of Object.entries(l.panels)) {
    if (typeof p?.type !== "string" || typeof p.bindings !== "object" || typeof p.config !== "object") {
      return `Panel "${id}" needs type, bindings and config.`;
    }
  }
  return null;
}

/** Drop panels no tab references (after removing or importing). */
export function prune(l: Layout): Layout {
  const used = new Set(l.tabs.flatMap((t) => panelIds(t.root)));
  const panels = Object.fromEntries(Object.entries(l.panels).filter(([id]) => used.has(id)));
  return { ...l, panels };
}

const telemetry = (channels: string[]): PanelState => ({
  type: "trace",
  bindings: {
    a: "/vehicle/{A}/telemetry",
    b: "/vehicle/{B}/telemetry",
    laps: "/timing/laps",
    corners: "/track/corners",
    outline: "/track/outline",
  },
  config: { x: "distance", channels, corners: true },
});
const map = (): PanelState => ({
  type: "track-map",
  bindings: { outline: "/track/outline", corners: "/track/corners", pose: "/vehicle/*/pose" },
  config: { labels: "ab", rotation: "auto" },
});
const lapChart = (entities: "all" | "ab"): PanelState => ({
  type: "lap-chart",
  bindings: { laps: "/timing/laps", events: "/session/events", stints: "/timing/stints" },
  config: { filter: "timed", dimOthers: true, entities },
});

/** The spec's default qualifying layout (exact split percentages). */
export function defaultQualiLayout(): Layout {
  return {
    version: 1,
    id: "quali-overview",
    name: "Qualifying · Overview",
    appliesTo: { kinds: ["qualifying"] },
    links: { cursor: "global", selection: "global" },
    tabs: [
      {
        id: "overview",
        name: "Overview",
        root: {
          direction: "row",
          splitPercentage: 30,
          first: "timing",
          second: {
            direction: "column",
            splitPercentage: 58,
            first: { direction: "row", splitPercentage: 62, first: "trace", second: "map" },
            second: { direction: "row", splitPercentage: 62, first: "laps", second: "log" },
          },
        },
      },
      {
        id: "compare",
        name: "Compare",
        root: {
          direction: "row",
          splitPercentage: 64,
          first: "trace2",
          second: { direction: "column", splitPercentage: 45, first: "map2", second: "laps2" },
        },
      },
    ],
    panels: {
      timing: {
        type: "timing-table",
        bindings: {
          order: "/timing/classification",
          laps: "/timing/laps",
          stints: "/timing/stints",
          events: "/session/events",
        },
        config: { columns: ["pos", "driver", "tyre", "best", "gap", "s1", "s2", "s3", "last", "laps"] },
      },
      trace: telemetry(["delta", "speed_kph", "throttle_pct", "brake_pct", "gear"]),
      map: map(),
      laps: lapChart("all"),
      log: {
        type: "event-log",
        bindings: { events: "/session/events" },
        config: { follow: true, raw: false, categories: [] },
      },
      trace2: telemetry(["delta", "speed_kph", "throttle_pct", "brake_pct", "gear", "rpm"]),
      map2: map(),
      laps2: lapChart("ab"),
    },
  };
}

/** Resolve a binding pattern against the selection. `*` stays a wildcard. */
export function resolveBinding(pattern: string, sel: { a: string | null; b: string | null }): string | null {
  if (pattern.includes("{A}")) return sel.a ? pattern.replaceAll("{A}", sel.a) : null;
  if (pattern.includes("{B}")) return sel.b ? pattern.replaceAll("{B}", sel.b) : null;
  return pattern;
}

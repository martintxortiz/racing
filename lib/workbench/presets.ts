// Default layouts. Every preset is a tab built from generic widgets, so it works for any
// series and session kind; widgets degrade on their own when a topic is missing.

import { newId, type Layout, type LayoutNode, type PanelState, type Split, type Tab } from "./layout";

const p = (type: string, bindings: Record<string, string>, config: Record<string, unknown> = {}): PanelState => ({
  type,
  bindings,
  config,
});

/** Panel factories with the bindings each widget needs. Exported for tests and the picker. */
export const WIDGETS = {
  timing: (columns?: string[]) =>
    p(
      "timing-table",
      { order: "/timing/classification", laps: "/timing/laps", stints: "/timing/stints", pits: "/timing/pit" },
      columns ? { columns } : {},
    ),
  telemetry: (channels?: string[]) =>
    p(
      "trace",
      { telemetry: "/vehicle/*/telemetry", laps: "/timing/laps", corners: "/track/corners" },
      { x: "distance", corners: true, delta: true, ...(channels ? { channels } : {}) },
    ),
  map: (labels = "selection") =>
    p("track-map", { outline: "/track/outline", corners: "/track/corners", pose: "/vehicle/*/pose" }, { labels, rotation: "auto" }),
  laps: (drivers: "field" | "selection" = "field") =>
    p("lap-chart", { laps: "/timing/laps", events: "/session/events" }, { filter: "timed", drivers, x: "time" }),
  log: () => p("event-log", { events: "/session/events" }, { follow: true }),
  session: () => p("session-info", { info: "/session/info", events: "/session/events", laps: "/timing/laps" }),
  weather: () => p("weather", { weather: "/session/weather" }),
  gaps: (mode = "auto") => p("gap-chart", { laps: "/timing/laps", order: "/timing/classification" }, { mode, drivers: "field" }),
  stints: () => p("stints", { stints: "/timing/stints", laps: "/timing/laps", pits: "/timing/pit" }, { drivers: "field" }),
  sectors: (drivers: "field" | "selection" = "field") => p("sectors", { laps: "/timing/laps" }, { drivers }),
};

export const PANEL_TYPES = [
  "timing-table",
  "trace",
  "track-map",
  "lap-chart",
  "gap-chart",
  "stints",
  "sectors",
  "event-log",
  "session-info",
  "weather",
] as const;

const row = (pct: number, first: LayoutNode, second: LayoutNode): Split => ({ direction: "row", splitPercentage: pct, first, second });
const col = (pct: number, first: LayoutNode, second: LayoutNode): Split => ({ direction: "column", splitPercentage: pct, first, second });

interface Preset {
  name: string;
  description: string;
  build: () => { root: LayoutNode; panels: Record<string, PanelState> };
}

export const PRESETS: Record<string, Preset> = {
  timing: {
    name: "Timing",
    description: "Timing tower, track map, lap times, race control and session status.",
    build: () => ({
      root: row(36, "timing", col(56, row(58, "map", col(55, "session", "weather")), row(60, "laps", "log"))),
      panels: {
        timing: WIDGETS.timing(),
        map: WIDGETS.map(),
        session: WIDGETS.session(),
        weather: WIDGETS.weather(),
        laps: WIDGETS.laps("field"),
        log: WIDGETS.log(),
      },
    }),
  },
  telemetry: {
    name: "Telemetry",
    description: "Compared drivers' laps by distance, with sectors, track map and their lap times.",
    build: () => ({
      root: row(64, "trace", col(42, "map", col(48, "sectors", "laps"))),
      panels: {
        trace: WIDGETS.telemetry(),
        map: WIDGETS.map(),
        sectors: WIDGETS.sectors("selection"),
        laps: WIDGETS.laps("selection"),
      },
    }),
  },
  strategy: {
    name: "Strategy",
    description: "Gaps or pace over laps, tyre stints, the order and conditions.",
    build: () => ({
      root: col(55, row(64, "gaps", "timing"), row(64, "stints", col(50, "weather", "log"))),
      panels: {
        gaps: WIDGETS.gaps(),
        timing: WIDGETS.timing(["pos", "driver", "gap", "int", "tyre", "laps", "pits"]),
        stints: WIDGETS.stints(),
        weather: WIDGETS.weather(),
        log: WIDGETS.log(),
      },
    }),
  },
  conditions: {
    name: "Session",
    description: "Session clock and status, weather over time and race control.",
    build: () => ({
      root: row(34, col(45, "session", "weather"), row(55, "log", "sectors")),
      panels: { session: WIDGETS.session(), weather: WIDGETS.weather(), log: WIDGETS.log(), sectors: WIDGETS.sectors("field") },
    }),
  },
};

export const DEFAULT_TABS = ["timing", "telemetry", "strategy"];

/** Instantiate a preset as a new tab with fresh panel ids that do not clash with `layout`. */
export function presetTab(key: string, layout: Pick<Layout, "tabs" | "panels">): { tab: Tab; panels: Record<string, PanelState> } {
  const preset = PRESETS[key];
  if (!preset) throw new Error(`Unknown preset ${key}`);
  const { root, panels } = preset.build();
  const taken = new Set(Object.keys(layout.panels));
  const rename = new Map<string, string>();
  const out: Record<string, PanelState> = {};
  for (const [id, panel] of Object.entries(panels)) {
    const nid = newId(panel.type, taken);
    taken.add(nid);
    rename.set(id, nid);
    out[nid] = panel;
  }
  const remap = (n: LayoutNode): LayoutNode =>
    typeof n === "string" ? rename.get(n)! : { ...n, first: remap(n.first), second: remap(n.second) };
  const tabId = newId(key, layout.tabs.map((t) => t.id));
  return { tab: { id: tabId, name: preset.name, root: remap(root) }, panels: out };
}

/** The default workspace: Timing, Telemetry and Strategy tabs. */
export function defaultLayout(): Layout {
  let l: Layout = {
    version: 1,
    id: "default",
    name: "Default",
    links: { cursor: "global", selection: "global" },
    tabs: [],
    panels: {},
  };
  for (const key of DEFAULT_TABS) {
    const { tab, panels } = presetTab(key, l);
    l = { ...l, tabs: [...l.tabs, tab], panels: { ...l.panels, ...panels } };
  }
  return l;
}

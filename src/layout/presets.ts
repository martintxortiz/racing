import type { SessionKind } from "@/derive/model";
import { leaf, split, uid, type Layout, type LayoutNode, type PanelState, type Tab } from "./model";

export interface PresetInfo {
  id: string;
  name: string;
  kind: SessionKind;
  description: string;
}

export const PRESETS: PresetInfo[] = [
  { id: "preset:qualifying", name: "Qualifying", kind: "qualifying", description: "Monitor, timing, track map, lap comparison, lap history" },
  { id: "preset:race", name: "Race", kind: "race", description: "Monitor, order and gaps, race trace, strategy, comparison" },
  { id: "preset:practice", name: "Practice / Endurance", kind: "practice", description: "Monitor, overview, long runs, telemetry" },
];

export function presetFor(kind: SessionKind): PresetInfo {
  return PRESETS.find((p) => p.kind === kind) ?? PRESETS[2];
}

type Spec = { type: string; config?: Record<string, unknown>; title?: string };
type Tree = Spec | { dir: "row" | "col"; ratio: number; a: Tree; b: Tree };
const row = (ratio: number, a: Tree, b: Tree): Tree => ({ dir: "row", ratio, a, b });
const col = (ratio: number, a: Tree, b: Tree): Tree => ({ dir: "col", ratio, a, b });
const w = (type: string, config: Record<string, unknown> = {}, title?: string): Spec => ({ type, config, title });

function build(tabs: [string, Tree][]): { tabs: Tab[]; panels: Record<string, PanelState> } {
  const panels: Record<string, PanelState> = {};
  const walk = (t: Tree): LayoutNode => {
    if ("type" in t) {
      const id = uid("p");
      panels[id] = { id, type: t.type, title: t.title, config: t.config ?? {} };
      return leaf(id);
    }
    return split(t.dir, walk(t.a), walk(t.b), t.ratio);
  };
  return { tabs: tabs.map(([name, tree]) => ({ id: uid("t"), name, root: walk(tree) })), panels };
}

/** Bump when the built-in tabs change, so saved copies of the presets are rebuilt. */
export const PRESET_REV = 4;

const speed = () => w("compare", { channels: ["speed_kph"], delta: true }, "Speed trace");
const trackWeather = () => w("session", {}, "Track & weather");
const raceControl = () => w("events", { dense: true, hide: ["blue"] }, "Race control messages");

/**
 * Monitor: the first screen of a pit wall, with the proportions of Pitwall v2's Monitor tab
 * (measured from its default screen, 1280 x 800):
 * - left 27.8 %: Track & weather and race control over the track map beside the lap time distribution;
 * - middle 63.2 % of the rest: ranking tower over the circle map beside tyre strategy, pit window below;
 * - right: team radio, race trace, pit stops, speed trace.
 * Every session type gets the same arrangement. Panels that only make sense in a race are swapped for
 * the nearest general one: lap times for the race trace, sectors for pit stops, pit stops for the pit window.
 */
export const MONITOR = {
  left: 0.278,
  mid: 0.632,
  leftTop: 0.313,
  weather: 0.39,
  map: 0.618,
  tower: 0.433,
  strategyRow: 0.736,
  circle: 0.36,
  radio: 0.243,
  trace: 0.328,
  stops: 0.36,
} as const;

function monitor(race: boolean): Tree {
  const m = MONITOR;
  const left = col(m.leftTop, col(m.weather, trackWeather(), raceControl()), row(m.map, w("map", { labels: "all" }, "Track map"), w("ladder", {}, "Lap time distribution")));
  const mid = col(
    m.tower,
    w("tower", {}, "Ranking tower"),
    col(m.strategyRow, row(m.circle, w("circle", {}, "Circle map"), w("stints", {}, "Tyre strategy")), race ? w("pitwindow", {}, "Pit window") : w("pitstops", {}, "Pit stops")),
  );
  const right = col(
    m.radio,
    w("radio", {}, "Team radio"),
    col(m.trace, race ? w("gaps", {}, "Race trace") : w("laptimes", {}, "Lap times"), col(m.stops, race ? w("pitstops", {}, "Pit stops") : w("sectors", {}, "Sectors"), speed())),
  );
  return row(m.left, left, row(m.mid, mid, right));
}

const TREES: Record<string, [string, Tree][]> = {
  "preset:qualifying": [
    ["Monitor", monitor(false)],
    ["Overview", row(0.46, col(0.14, w("session"), w("timing")), col(0.56, w("map"), row(0.5, w("laptimes"), w("events"))))],
    ["Compare", row(0.3, col(0.62, w("timing", { compact: true }), w("sectors")), col(0.64, w("compare"), w("map", { colourBy: "dominance" })))],
    ["Laps", col(0.58, w("history"), row(0.55, w("laptimes", { scope: "focus" }), w("sectors")))],
  ],
  "preset:race": [
    ["Monitor", monitor(true)],
    ["Race", row(0.52, col(0.14, w("session"), w("timing")), col(0.5, w("map"), row(0.56, w("gaps"), w("events"))))],
    ["Strategy", col(0.46, w("stints"), row(0.5, w("laptimes", { scope: "focus" }), w("history", { value: "delta" })))],
    ["Compare", row(0.3, col(0.62, w("timing", { compact: true }), w("sectors")), col(0.64, w("compare"), w("map", { colourBy: "dominance" })))],
  ],
  "preset:practice": [
    ["Monitor", monitor(false)],
    ["Overview", row(0.46, col(0.14, w("session"), w("timing")), col(0.56, w("map"), row(0.5, w("laptimes"), w("events"))))],
    ["Long runs", col(0.55, w("laptimes", { scope: "focus" }), row(0.5, w("stints"), w("history")))],
    ["Telemetry", row(0.3, w("timing", { compact: true }), col(0.6, w("compare"), w("signal")))],
  ],
};

export function buildPreset(id: string): Layout {
  const info = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  const { tabs, panels } = build(TREES[info.id]);
  return { id: info.id, name: info.name, version: 1, tabs, panels, preset: info.id, rev: PRESET_REV };
}

export function isPreset(id: string): boolean {
  return id.startsWith("preset:");
}

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
export const PRESET_REV = 2;

const speed = () => w("compare", { channels: ["speed_kph"], delta: true }, "Speed trace");
const trackWeather = () => w("session", {}, "Track & weather");
const raceControl = () => w("events", { dense: true, hide: ["blue"] }, "Race control messages");

/**
 * Monitor: the first screen of a pit wall. Three columns: session state and track on the left,
 * the running order with strategy in the middle, radio, trace, stops and speed on the right.
 * `mid` and `right` swap race-only panels for their qualifying and practice counterparts.
 */
function monitor(race: boolean): Tree {
  const left = col(0.075, trackWeather(), col(0.24, raceControl(), row(0.6, w("map", { labels: "all" }, "Track map"), w("ladder", {}, "Lap time distribution"))));
  const mid = col(
    0.5,
    w("tower", {}, "Ranking tower"),
    race ? col(0.74, row(0.4, w("circle", {}, "Circle map"), w("stints", {}, "Tyre strategy")), w("pitwindow", {}, "Pit window")) : row(0.4, w("circle", {}, "Circle map"), w("sectors", {}, "Sectors")),
  );
  const right = col(
    0.24,
    w("radio", {}, "Team radio"),
    col(0.33, race ? w("gaps", {}, "Race trace") : w("laptimes", {}, "Lap times"), col(0.45, race ? w("pitstops", {}, "Pit stops") : w("stints", {}, "Tyre strategy"), speed())),
  );
  return row(0.25, left, row(0.645, mid, right));
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

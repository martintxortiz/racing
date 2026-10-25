import type { SessionKind } from "@/derive/model";
import { leaf, split, uid, type Layout, type LayoutNode, type PanelState, type Tab } from "./model";

export interface PresetInfo {
  id: string;
  name: string;
  kind: SessionKind;
  description: string;
}

export const PRESETS: PresetInfo[] = [
  { id: "preset:qualifying", name: "Qualifying", kind: "qualifying", description: "Timing, track map, lap comparison, lap history" },
  { id: "preset:race", name: "Race", kind: "race", description: "Order and gaps, race trace, strategy, comparison" },
  { id: "preset:practice", name: "Practice / Endurance", kind: "practice", description: "Overview, long runs, telemetry" },
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

const TREES: Record<string, [string, Tree][]> = {
  "preset:qualifying": [
    ["Overview", row(0.46, col(0.14, w("session"), w("timing")), col(0.56, w("map"), row(0.5, w("laptimes"), w("events"))))],
    ["Compare", row(0.3, col(0.62, w("timing", { compact: true }), w("sectors")), col(0.64, w("compare"), w("map", { colourBy: "dominance" })))],
    ["Laps", col(0.58, w("history"), row(0.55, w("laptimes", { scope: "focus" }), w("sectors")))],
  ],
  "preset:race": [
    ["Race", row(0.52, col(0.14, w("session"), w("timing")), col(0.5, w("map"), row(0.56, w("gaps"), w("events"))))],
    ["Strategy", col(0.46, w("stints"), row(0.5, w("laptimes", { scope: "focus" }), w("history", { value: "delta" })))],
    ["Compare", row(0.3, col(0.62, w("timing", { compact: true }), w("sectors")), col(0.64, w("compare"), w("map", { colourBy: "dominance" })))],
  ],
  "preset:practice": [
    ["Overview", row(0.46, col(0.14, w("session"), w("timing")), col(0.56, w("map"), row(0.5, w("laptimes"), w("events"))))],
    ["Long runs", col(0.55, w("laptimes", { scope: "focus" }), row(0.5, w("stints"), w("history")))],
    ["Telemetry", row(0.3, w("timing", { compact: true }), col(0.6, w("compare"), w("signal")))],
  ],
};

export function buildPreset(id: string): Layout {
  const info = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  const { tabs, panels } = build(TREES[info.id]);
  return { id: info.id, name: info.name, version: 1, tabs, panels, preset: info.id };
}

export function isPreset(id: string): boolean {
  return id.startsWith("preset:");
}

"use client";

import type { PanelState } from "@/lib/workbench/layout";
import type { PanelDef, PanelProps } from "./common";
import { eventLog } from "./EventLog";
import { lapChart } from "./LapChart";
import { timingTable } from "./TimingTable";
import { trace } from "./Trace";
import { trackMap } from "./TrackMap";

export const PANELS: PanelDef[] = [timingTable, trackMap, trace, lapChart, eventLog];
const byType = new Map(PANELS.map((d) => [d.type, d]));

/** Unknown panel types render their JSON so a newer layout never breaks an older app. */
function Missing({ panel }: PanelProps) {
  return (
    <div className="pw-empty wb-missing">
      <div className="pw-empty__title">Unknown panel type “{panel.type}”</div>
      <pre>{JSON.stringify(panel, null, 2)}</pre>
    </div>
  );
}
const missing: PanelDef = {
  type: "missing",
  title: "Unknown panel",
  description: "",
  icon: "warning",
  primary: "",
  slots: {},
  defaultConfig: {},
  Component: Missing,
};

export const panelDef = (type: string): PanelDef => byType.get(type) ?? missing;

export function newPanelState(def: PanelDef): PanelState {
  return {
    type: def.type,
    bindings: Object.fromEntries(Object.entries(def.slots).map(([k, s]) => [k, s.default])),
    config: structuredClone(def.defaultConfig),
  };
}

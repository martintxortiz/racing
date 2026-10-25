import type { ComponentType } from "react";
import type { FileSummary } from "@/data/types";
import type { SessionModel } from "@/derive/model";
import type { MenuItem } from "@/menus/types";

export interface WidgetProps<C = Record<string, unknown>> {
  panelId: string;
  config: C;
  setConfig: (patch: Partial<C>) => void;
  session: SessionModel;
  width: number;
  height: number;
}

export interface WidgetDef<C = Record<string, unknown>> {
  type: string;
  name: string;
  description: string;
  group: "Timing" | "Track" | "Telemetry" | "Session";
  /** Why the widget cannot show anything for this file, or null when it can. */
  unavailable?: (s: SessionModel, summary: FileSummary) => string | null;
  Component: ComponentType<WidgetProps<C>>;
  /** Panel-level settings shown in the header and body menus. */
  menu?: (p: { config: C; setConfig: (patch: Partial<C>) => void; session: SessionModel }) => MenuItem[];
}

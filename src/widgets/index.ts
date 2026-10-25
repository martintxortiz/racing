import type { WidgetDef } from "./types";
import { sessionWidget } from "./Session";
import { timingWidget } from "./Timing";
import { mapWidget } from "./TrackMap";
import { compareWidget } from "./Compare";
import { laptimesWidget } from "./LapTimes";
import { eventsWidget } from "./Events";
import { historyWidget } from "./History";
import { sectorsWidget } from "./Sectors";
import { gapsWidget } from "./Gaps";
import { stintsWidget } from "./Stints";
import { signalWidget } from "./Signal";

export const WIDGETS: WidgetDef[] = [
  timingWidget,
  historyWidget,
  sectorsWidget,
  laptimesWidget,
  gapsWidget,
  stintsWidget,
  mapWidget,
  compareWidget,
  signalWidget,
  sessionWidget,
  eventsWidget,
] as unknown as WidgetDef[];

const BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

export function widgetDef(type: string): WidgetDef | undefined {
  return BY_TYPE.get(type);
}

/** Session model types. All times are seconds since the file's first message. */

export type SessionKind = "qualifying" | "race" | "practice";

export interface Entity {
  id: string;
  number: string;
  code: string;
  name: string;
  team: string;
  /** CSS colour, e.g. #F47600. */
  colour: string;
}

export interface Segment {
  id: string;
  label: string;
  t0: number;
  t1: number;
}

export interface Lap {
  entity: string;
  n: number;
  t0: number;
  /** End time: t0 + time, or next lap start when the time is missing. */
  t1: number | null;
  time: number | null;
  s: [number | null, number | null, number | null];
  i1: number | null;
  i2: number | null;
  st: number | null;
  pitOut: boolean;
  pitIn: boolean;
  deleted: boolean;
  segment: number;
  compound: string | null;
  tyreAge: number | null;
  /** Timed, not deleted, not an in/out lap. */
  valid: boolean;
}

export interface RcEvent {
  t: number;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  entity: string | null;
  lap: number | null;
  phase: number | null;
  message: string;
}

export interface Stint {
  entity: string;
  n: number;
  lapStart: number;
  lapEnd: number;
  compound: string;
  ageAtStart: number;
}

export interface Pit {
  t: number;
  entity: string;
  lap: number | null;
  lane: number | null;
  stop: number | null;
}

/** A team radio clip. Files carry audio only, no transcript. */
export interface Radio {
  t: number;
  entity: string;
  url: string;
}

export interface Corner {
  number: number;
  letter: string;
  d: number;
  x: number;
  y: number;
}

export interface Outline {
  x: Float64Array;
  y: Float64Array;
  d: Float64Array;
  length: number;
}

export interface Series {
  t: Float64Array;
  entity: string[];
  values: Record<string, Float64Array>;
}

export interface SessionModel {
  fileName: string;
  bytes: number;
  kind: SessionKind;
  title: string;
  sessionName: string;
  circuit: string;
  /** Epoch seconds of t = 0. */
  epoch0: number;
  tzOffsetMin: number;
  duration: number;
  window: [number, number];
  entities: Entity[];
  entityById: Map<string, Entity>;
  laps: Lap[];
  lapsByEntity: Map<string, Lap[]>;
  segments: Segment[];
  events: RcEvent[];
  stints: Stint[];
  pits: Pit[];
  radio: Radio[];
  order: Series | null;
  intervals: Series | null;
  weather: { t: Float64Array; values: Record<string, Float64Array> } | null;
  outline: Outline | null;
  corners: Corner[];
  totalLaps: number | null;
  /** Entities classified as not finishing (from results, when present). */
  dnf: Set<string>;
  /** Number of laps the leader had completed at the end. */
  raceLaps: number;
}

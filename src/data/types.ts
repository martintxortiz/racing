/** Shared types between the decode worker and the app. Times are seconds since the file's first message. */

export type FieldKind = "num" | "str" | "json";

export interface FieldInfo {
  name: string;
  kind: FieldKind;
  unit?: string;
}

export interface TopicInfo {
  name: string;
  schema: string;
  count: number;
  /** Fields from the JSON schema (snapshot topics: fields of one row). */
  fields: FieldInfo[];
  /** Snapshot topic: one message holding `rows`. */
  rows: boolean;
  /** Entity id when the topic name embeds one (e.g. /car/44/telemetry -> "44"). */
  entity?: string;
  /** Topic name with the entity replaced by `*`, e.g. /car/* /telemetry. */
  pattern?: string;
}

export interface FileSummary {
  name: string;
  bytes: number;
  /** First message time, ns since epoch, as a decimal string (bigint safe). */
  startNs: string;
  /** Duration of the recording in seconds. */
  duration: number;
  topics: TopicInfo[];
  metadata: Record<string, Record<string, string>>;
}

/** Columnar decode of one topic. Numeric fields become Float64Array with NaN for null. */
export interface Columns {
  topic: string;
  n: number;
  t: Float64Array;
  num: Record<string, Float64Array>;
  str: Record<string, (string | null)[]>;
  json: Record<string, unknown[]>;
}

export type WorkerRequest =
  | { type: "open"; file?: File; url?: string; name?: string }
  | { type: "load"; id: number; topics: string[] };

export type WorkerResponse =
  | { type: "progress"; phase: "download" | "index" | "decode"; loaded: number; total: number }
  | { type: "summary"; summary: FileSummary }
  | { type: "data"; id: number; columns: Columns[]; ms: number }
  | { type: "error"; message: string; id?: number };

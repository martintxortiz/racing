import type { Columns, FieldInfo } from "./types";

/** Builds Columns from decoded JSON messages. Pure, used by the worker and tests. */
export class ColumnBuilder {
  private t: number[] = [];
  private num = new Map<string, number[]>();
  private str = new Map<string, (string | null)[]>();
  private json = new Map<string, unknown[]>();
  private n = 0;

  constructor(
    private topic: string,
    fields: FieldInfo[] = [],
  ) {
    for (const f of fields) this.ensure(f.name, f.kind);
  }

  private ensure(name: string, kind: "num" | "str" | "json") {
    const map = kind === "num" ? this.num : kind === "str" ? this.str : this.json;
    if (map.has(name)) return;
    // A field may change kind (number then string); keep the first kind, but never lose rows.
    if (this.num.has(name) || this.str.has(name) || this.json.has(name)) return;
    const arr = new Array(this.n).fill(kind === "num" ? NaN : null);
    (map as Map<string, unknown[]>).set(name, arr);
  }

  push(t: number, msg: Record<string, unknown>) {
    const i = this.n++;
    this.t.push(t);
    for (const key in msg) {
      if (key === "timestamp_ns") continue; // > 2^53, never a time source
      const v = msg[key];
      if (!this.num.has(key) && !this.str.has(key) && !this.json.has(key)) {
        if (v === null || v === undefined) continue; // decide the kind on the first non-null
        const kind = typeof v === "number" || typeof v === "boolean" ? "num" : typeof v === "string" ? "str" : "json";
        this.ensure(key, kind);
      }
      const a = this.num.get(key);
      if (a) {
        a[i] = typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : NaN;
        continue;
      }
      const s = this.str.get(key);
      if (s) {
        s[i] = v === null || v === undefined ? null : String(v);
        continue;
      }
      const j = this.json.get(key);
      if (j) j[i] = v ?? null;
    }
    // pad fields missing from this message
    for (const a of this.num.values()) if (a.length <= i) a[i] = NaN;
    for (const a of this.str.values()) if (a.length <= i) a[i] = null;
    for (const a of this.json.values()) if (a.length <= i) a[i] = null;
  }

  build(): Columns {
    const num: Record<string, Float64Array> = {};
    for (const [k, v] of this.num) num[k] = Float64Array.from(v);
    return {
      topic: this.topic,
      n: this.n,
      t: Float64Array.from(this.t),
      num,
      str: Object.fromEntries(this.str),
      json: Object.fromEntries(this.json),
    };
  }
}

/** Fields of a JSON schema (object properties; snapshot topics use the items of `rows`). */
export function fieldsFromSchema(schemaText: string): { fields: FieldInfo[]; rows: boolean } {
  try {
    const s = JSON.parse(schemaText) as { properties?: Record<string, SchemaProp> };
    let props = s.properties ?? {};
    let rows = false;
    const rowItems = props.rows?.items?.properties;
    if (rowItems) {
      props = rowItems;
      rows = true;
    }
    const fields: FieldInfo[] = [];
    for (const [name, p] of Object.entries(props)) {
      if (name === "timestamp_ns") continue;
      fields.push({ name, kind: kindOf(p), unit: unitOf(name) });
    }
    return { fields, rows };
  } catch {
    return { fields: [], rows: false };
  }
}

interface SchemaProp {
  type?: string | string[];
  items?: { properties?: Record<string, SchemaProp> };
}

function kindOf(p: SchemaProp): "num" | "str" | "json" {
  const types = Array.isArray(p.type) ? p.type : [p.type];
  if (types.includes("number") || types.includes("integer") || types.includes("boolean")) return "num";
  if (types.includes("string")) return "str";
  return "json";
}

const UNITS: [RegExp, string][] = [
  [/_kph$/, "km/h"],
  [/_mps$/, "m/s"],
  [/_pct$/, "%"],
  [/_c$/, "°C"],
  [/_s$/, "s"],
  [/_m$/, "m"],
  [/_deg$/, "°"],
  [/_mbar$/, "mbar"],
  [/_laps$/, "laps"],
  [/^rpm$/, "rpm"],
];

export function unitOf(field: string): string | undefined {
  for (const [re, u] of UNITS) if (re.test(field)) return u;
  return undefined;
}

/** Entity id embedded in a topic name: /car/44/telemetry -> 44, /vehicle/7/pose -> 7. */
export function topicEntity(topic: string): { entity?: string; pattern?: string } {
  const m = /^\/(car|vehicle|cars|vehicles|entity)\/([^/]+)\/(.+)$/.exec(topic);
  if (!m) return {};
  return { entity: m[2], pattern: `/${m[1]}/*/${m[3]}` };
}

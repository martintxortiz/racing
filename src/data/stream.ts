import { getSession, summaryFromDetails, wsUrl, type ApiSessionDetails } from "./api";
import { ColumnBuilder } from "./columns";
import { emptyColumns } from "./reader";
import type { Columns, FileSummary, TopicInfo } from "./types";

/** `[topic, seconds since session start, payload]` as sent by the session server. */
export type WireMsg = [string, number, Record<string, unknown>];

export type Frame =
  | { type: "hello"; session: string; start_ns: string; duration: number; live: boolean; topics: string[] }
  | { type: "static"; msgs: WireMsg[] }
  | { type: "snapshot"; t: number; topics: string[]; msgs: WireMsg[] }
  | { type: "batch"; kind: "history" | "stream" | "live"; msgs: WireMsg[]; clock?: number }
  | { type: "history_done"; t: number; topics: string[] }
  | { type: "state"; t: number; playing: boolean; speed: number; live: boolean; head?: number; ack?: number }
  | { type: "end"; t: number }
  | { type: "error"; message: string };

/** Append `b`'s rows after `a`'s (both time-sorted, b later). */
export function appendColumns(a: Columns, b: Columns): Columns {
  if (!b.n) return a;
  if (!a.n) return b;
  const n = a.n + b.n;
  const t = new Float64Array(n);
  t.set(a.t);
  t.set(b.t, a.n);
  const num: Columns["num"] = {};
  for (const k of new Set([...Object.keys(a.num), ...Object.keys(b.num)])) {
    const v = new Float64Array(n).fill(NaN);
    if (a.num[k]) v.set(a.num[k]);
    if (b.num[k]) v.set(b.num[k], a.n);
    num[k] = v;
  }
  const pad = <T,>(x: T[] | undefined, len: number): T[] => x ?? new Array(len).fill(null);
  const str: Columns["str"] = {};
  for (const k of new Set([...Object.keys(a.str), ...Object.keys(b.str)])) str[k] = [...pad(a.str[k], a.n), ...pad(b.str[k], b.n)];
  const json: Columns["json"] = {};
  for (const k of new Set([...Object.keys(a.json), ...Object.keys(b.json)])) json[k] = [...pad(a.json[k], a.n), ...pad(b.json[k], b.n)];
  return { topic: a.topic, n, t, num, str, json };
}

class TopicBuffer {
  builder: ColumnBuilder;
  /** Snapshot rows shown until the history up to them has arrived. */
  snap: ColumnBuilder | null = null;
  snapT = -Infinity;
  lastT = -Infinity;
  private cached: Columns | null = null;

  constructor(
    private topic: string,
    private info: TopicInfo | undefined,
  ) {
    this.builder = new ColumnBuilder(topic, info?.fields ?? []);
  }

  private pushInto(b: ColumnBuilder, t: number, msg: Record<string, unknown>) {
    if (this.info?.rows && Array.isArray(msg.rows)) for (const row of msg.rows as Record<string, unknown>[]) b.push(t, row);
    else b.push(t, msg);
  }

  push(t: number, msg: Record<string, unknown>) {
    // The server never sends a topic's messages out of order; drop anything older defensively.
    if (t < this.lastT) return;
    this.pushInto(this.builder, t, msg);
    this.lastT = t;
    this.cached = null;
  }

  snapshot(t: number, msg: Record<string, unknown>) {
    this.snap = new ColumnBuilder(this.topic, this.info?.fields ?? []);
    this.pushInto(this.snap, t, msg);
    this.snapT = t;
    this.cached = null;
  }

  clearSnapshot() {
    if (!this.snap) return;
    this.snap = null;
    this.cached = null;
  }

  columns(): Columns {
    if (this.cached) return this.cached;
    const base = this.builder.build();
    this.cached = this.snap && this.snapT > this.lastT ? appendColumns(base, this.snap.build()) : base;
    return this.cached;
  }
}

/**
 * Columns assembled from a server stream. Pure state machine over frames (no I/O), so the
 * protocol handling is unit-testable. Topics grow in time order; `takeDirty` returns the ones
 * that changed since the last call.
 */
export class StreamStore {
  private bufs = new Map<string, TopicBuffer>();
  private dirty = new Set<string>();
  head: number | null = null;
  clock: number | null = null;
  playing = false;
  ended = false;
  error: string | null = null;
  acked = 0;

  constructor(private infos: Map<string, TopicInfo>) {}

  private buf(topic: string): TopicBuffer {
    let b = this.bufs.get(topic);
    if (!b) this.bufs.set(topic, (b = new TopicBuffer(topic, this.infos.get(topic))));
    return b;
  }

  has(topic: string) {
    return this.bufs.has(topic);
  }

  apply(f: Frame): void {
    switch (f.type) {
      case "static":
      case "batch":
        for (const [topic, t, msg] of f.msgs) {
          this.buf(topic).push(t, msg);
          this.dirty.add(topic);
        }
        if (f.type === "batch" && f.clock != null) {
          this.clock = f.clock;
          if (f.kind === "live") this.head = Math.max(this.head ?? 0, f.clock);
        }
        break;
      case "snapshot":
        for (const [topic, t, msg] of f.msgs) {
          this.buf(topic).snapshot(t, msg);
          this.dirty.add(topic);
        }
        for (const topic of f.topics) this.buf(topic);
        break;
      case "history_done":
        for (const topic of f.topics) {
          this.buf(topic).clearSnapshot();
          this.dirty.add(topic);
        }
        break;
      case "state":
        this.clock = f.t;
        this.playing = f.playing;
        if (f.head != null) this.head = Math.max(this.head ?? 0, f.head);
        if (f.ack != null) this.acked = Math.max(this.acked, f.ack);
        break;
      case "end":
        this.ended = true;
        this.playing = false;
        break;
      case "error":
        this.error = f.message;
        break;
      case "hello":
        if (f.live) this.head = f.duration;
        break;
    }
  }

  columns(topic: string): Columns {
    return this.bufs.get(topic)?.columns() ?? emptyColumns(topic);
  }

  takeDirty(): Columns[] {
    const out = [...this.dirty].map((t) => this.columns(t));
    this.dirty.clear();
    return out;
  }
}

/** Minimal WebSocket surface (the browser's, or a fake in tests). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface StreamOptions {
  base: string;
  id: string;
  live: boolean;
  /** Replay: where the server clock starts (seconds). Default: the scheduled session start. */
  t?: number;
  /** Live (simulated): start point and pace when the server starts the simulation. */
  from?: number;
  speed?: number;
  /** How often grown columns are handed to the app (ms). */
  flushMs?: number;
  socket?: (url: string) => SocketLike;
  details?: (id: string, base: string) => Promise<ApiSessionDetails>;
}

export type Control = { op: "play" } | { op: "pause" } | { op: "seek"; t: number } | { op: "speed"; x: number };

export interface StreamUpdate {
  columns: Columns[];
  head: number | null;
  clock: number | null;
  closed?: string;
}

/** A session read through the server's WebSocket stream (replay or live). */
export class StreamConnection {
  store!: StreamStore;
  summary!: FileSummary;
  private ws: SocketLike | null = null;
  private nextId = 1;
  private waits = new Map<number, () => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  onUpdate: (u: StreamUpdate) => void = () => {};

  constructor(readonly opts: StreamOptions) {}

  async open(): Promise<FileSummary> {
    const o = this.opts;
    const details = await (o.details ?? ((id, base) => getSession(id, base)))(o.id, o.base);
    if (this.disposed) throw new Error("The stream was closed.");
    this.summary = summaryFromDetails(details);
    this.store = new StreamStore(new Map(this.summary.topics.map((t) => [t.name, t])));
    const q = new URLSearchParams();
    if (o.live) q.set("live", "true");
    if (o.live && o.from != null) q.set("from", String(o.from));
    if (o.live && o.speed != null) q.set("speed", String(o.speed));
    const url = wsUrl(o.base, `/api/sessions/${encodeURIComponent(o.id)}/stream${q.size ? `?${q}` : ""}`);
    const ws = (o.socket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(url);
    this.ws = ws;
    const hello = await new Promise<Extract<Frame, { type: "hello" }>>((resolve, reject) => {
      ws.onerror = () => reject(new Error(`Cannot open the stream at ${url}. Is the session server running?`));
      ws.onclose = (e) => reject(new Error(`The stream closed before it started${e?.reason ? `: ${e.reason}` : ""}.`));
      ws.onmessage = (ev) => {
        const f = JSON.parse(String(ev.data)) as Frame;
        if (f.type === "hello") resolve(f);
        else if (f.type === "error") reject(new Error(f.message));
      };
    });
    this.store.apply(hello);
    ws.onmessage = (ev) => this.frame(JSON.parse(String(ev.data)) as Frame);
    ws.onclose = (e) => {
      if (this.disposed) return;
      this.onUpdate({ columns: [], head: this.store.head, clock: this.store.clock, closed: e?.reason || "The stream disconnected." });
    };
    ws.onerror = null;
    this.summary = { ...this.summary, startNs: hello.start_ns || this.summary.startNs, duration: o.live ? Math.max(hello.duration, 0) : this.summary.duration };
    if (!o.live) {
      const sched = Number(details.metadata?.session?.date_start_ns);
      const start = Number.isFinite(sched) && sched > 0 ? (sched - Number(this.summary.startNs)) / 1e9 : 0;
      const t0 = o.t ?? Math.max(0, start);
      this.send({ op: "seek", t: Math.min(Math.max(0, t0), this.summary.duration) });
    }
    return this.summary;
  }

  private frame(f: Frame) {
    this.store.apply(f);
    if (f.type === "state" && f.ack != null) {
      for (const [id, done] of this.waits) {
        if (id <= f.ack) {
          done();
          this.waits.delete(id);
        }
      }
    }
    if (f.type === "batch" || f.type === "snapshot" || f.type === "history_done" || f.type === "static" || (f.type === "state" && this.opts.live)) this.schedule();
  }

  private schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.opts.flushMs ?? 250);
  }

  flush() {
    const columns = this.store.takeDirty();
    this.onUpdate({ columns, head: this.store.head, clock: this.store.clock });
  }

  /** Send a command; resolves when the server has finished handling it. */
  send(cmd: Record<string, unknown>): Promise<void> {
    const id = this.nextId++;
    const p = new Promise<void>((resolve) => this.waits.set(id, resolve));
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ ...cmd, id }));
    return p;
  }

  /**
   * Subscribe and wait for the topics' history up to the server clock. With no `since` on a
   * replay the whole topic is fetched at once (the small timing topics), so session-wide views
   * such as lap charts match a local file; per-car topics pass `since` and stream with the clock.
   */
  async load(topics: string[], since?: number): Promise<Columns[]> {
    const known = new Set(this.summary.topics.map((t) => t.name));
    const want = topics.filter((t) => known.has(t));
    const full = since == null && !this.opts.live;
    if (want.length) await this.send({ op: "subscribe", topics: want, mode: "history", ...(full ? { full } : {}), ...(since != null ? { since } : {}) });
    // Columns handed out here are complete up to the server clock; later growth arrives via onUpdate.
    return topics.map((t) => this.store.columns(t));
  }

  control(c: Control) {
    if (this.opts.live) return;
    void this.send(c as unknown as Record<string, unknown>);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const done of this.waits.values()) done();
    this.waits.clear();
    this.ws?.close();
    this.ws = null;
  }
}

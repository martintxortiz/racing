import { API_URL } from "./api";
import type { Progress } from "./client";
import { StreamConnection, type Control, type StreamOptions, type StreamUpdate } from "./stream";
import type { Columns, FileSummary } from "./types";

/**
 * Where a session's data comes from.
 *  - "file" / "url" / "sample": a whole .mcap decoded in the browser worker (columns are final).
 *  - "replay": the session server streams a recording, paced to the app clock (columns grow).
 *  - "live": the session server pushes messages as they are produced (columns grow, head moves).
 */
export type SourceKind = "file" | "url" | "sample" | "replay" | "live";

export interface SourceSpec {
  kind: SourceKind;
  file?: File;
  url?: string;
  name?: string;
  /** Server session id ("replay" and "live"). */
  id?: string;
  /** Server base URL; defaults to NEXT_PUBLIC_API_URL. */
  base?: string;
  /** Replay start (seconds). */
  t?: number;
  /** Simulated live: start point and pace. */
  from?: number;
  speed?: number;
}

export interface DataSource {
  readonly spec: SourceSpec;
  /** Columns keep growing after load() resolves; updates arrive through onUpdate. */
  readonly streaming: boolean;
  readonly live: boolean;
  open(onProgress: (p: Progress) => void): Promise<FileSummary>;
  /** Columns for these topics (for streams: complete up to the current clock). */
  load(topics: string[], since?: number): Promise<Columns[]>;
  /** Streams: grown columns, the live head, or a disconnect. */
  onUpdate: (u: StreamUpdate) => void;
  /** Streams: mirror the app's transport (replay only; live ignores it). */
  control(c: Control): void;
  dispose(): void;
}

export function isStreaming(kind: SourceKind): boolean {
  return kind === "replay" || kind === "live";
}

/** Decodes a whole file in the browser worker: the original path, unchanged. */
export class WorkerSource implements DataSource {
  readonly streaming = false;
  readonly live = false;
  onUpdate: (u: StreamUpdate) => void = () => {};
  private client: import("./client").DataClient | null = null;

  constructor(
    readonly spec: SourceSpec,
    private makeClient: () => Promise<import("./client").DataClient> = async () => new (await import("./client")).DataClient(),
  ) {}

  async open(onProgress: (p: Progress) => void): Promise<FileSummary> {
    this.client = await this.makeClient();
    this.client.onProgress = onProgress;
    return this.client.open({ file: this.spec.file, url: this.spec.url, name: this.spec.name });
  }

  load(topics: string[]): Promise<Columns[]> {
    if (!this.client) return Promise.reject(new Error("Source not open"));
    return this.client.load(topics);
  }

  control() {}

  dispose() {
    this.client?.dispose();
    this.client = null;
  }
}

/** A server session streamed over a WebSocket. */
export class ServerSource implements DataSource {
  readonly streaming = true;
  readonly live: boolean;
  readonly conn: StreamConnection;
  onUpdate: (u: StreamUpdate) => void = () => {};

  constructor(
    readonly spec: SourceSpec,
    extra: Partial<StreamOptions> = {},
  ) {
    if (!spec.id) throw new Error("A server source needs a session id");
    this.live = spec.kind === "live";
    this.conn = new StreamConnection({ base: spec.base ?? API_URL, id: spec.id, live: this.live, t: spec.t, from: spec.from, speed: spec.speed, ...extra });
    this.conn.onUpdate = (u) => this.onUpdate(u);
  }

  async open(onProgress: (p: Progress) => void): Promise<FileSummary> {
    onProgress({ phase: "download", loaded: 0, total: 0 });
    const s = await this.conn.open();
    onProgress({ phase: "decode", loaded: 0, total: 1 });
    return s;
  }

  load(topics: string[], since?: number): Promise<Columns[]> {
    return this.conn.load(topics, since);
  }

  control(c: Control) {
    this.conn.control(c);
  }

  dispose() {
    this.conn.dispose();
  }
}

export function createSource(spec: SourceSpec, extra?: Partial<StreamOptions>): DataSource {
  return isStreaming(spec.kind) ? new ServerSource(spec, extra) : new WorkerSource(spec);
}

/** Read a source from the address bar: ?api=<id>[&live=1][&from=s][&speed=x] or ?src=<url>. */
export function specFromParams(params: URLSearchParams, href: string): SourceSpec | null {
  const api = params.get("api");
  if (api) {
    const live = params.get("live") === "1" || params.get("live") === "true";
    const num = (k: string) => (params.get(k) != null && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : undefined);
    return { kind: live ? "live" : "replay", id: api, base: params.get("apiBase") ?? undefined, t: num("t"), from: num("from"), speed: num("speed"), name: api };
  }
  const src = params.get("src");
  if (src) return { kind: "url", url: new URL(src, href).toString() };
  return null;
}

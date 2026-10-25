import type { Columns, FileSummary, WorkerResponse } from "./types";

export type Progress = { phase: "download" | "index" | "decode"; loaded: number; total: number };

/** Main-thread handle on the decode worker. One file at a time. */
export class DataClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (c: Columns[]) => void; reject: (e: Error) => void }>();
  private opening: { resolve: (s: FileSummary) => void; reject: (e: Error) => void } | null = null;
  onProgress: (p: Progress) => void = () => {};

  constructor() {
    this.worker = new Worker(new URL("./mcap.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data);
    this.worker.onerror = (e) => {
      const err = new Error(e.message || "The decoder stopped unexpectedly.");
      this.opening?.reject(err);
      this.opening = null;
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  private handle(msg: WorkerResponse) {
    if (msg.type === "progress") this.onProgress(msg);
    else if (msg.type === "summary") {
      this.opening?.resolve(msg.summary);
      this.opening = null;
    } else if (msg.type === "data") {
      this.pending.get(msg.id)?.resolve(msg.columns);
      this.pending.delete(msg.id);
    } else if (msg.type === "error") {
      const err = new Error(msg.message);
      if (msg.id != null) {
        this.pending.get(msg.id)?.reject(err);
        this.pending.delete(msg.id);
      } else {
        this.opening?.reject(err);
        this.opening = null;
      }
    }
  }

  open(src: { file?: File; url?: string; name?: string }): Promise<FileSummary> {
    return new Promise((resolve, reject) => {
      this.opening = { resolve, reject };
      this.worker.postMessage({ type: "open", ...src });
    });
  }

  load(topics: string[]): Promise<Columns[]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "load", id, topics });
    });
  }

  dispose() {
    this.worker.terminate();
  }
}

/// <reference lib="webworker" />
import { McapSession, bufferReadable, fileReadable } from "./reader";
import type { WorkerRequest, WorkerResponse } from "./types";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let session: McapSession | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer);
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not fetch the file (HTTP ${res.status}).`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const parts: Uint8Array[] = [];
  let loaded = 0;
  let last = 0;
  const r = res.body.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    parts.push(value);
    loaded += value.byteLength;
    if (performance.now() - last > 80) {
      last = performance.now();
      post({ type: "progress", phase: "download", loaded, total });
    }
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === "open") {
      session = null;
      const readable = req.file ? fileReadable(req.file) : bufferReadable(await download(req.url!));
      post({ type: "progress", phase: "index", loaded: 0, total: 1 });
      const opened = await McapSession.open(readable, req.name ?? req.file?.name ?? req.url ?? "session.mcap");
      session = opened.session;
      post({ type: "summary", summary: opened.summary });
    } else if (req.type === "load") {
      if (!session) throw new Error("No file is open.");
      const t0 = performance.now();
      const columns = await session.load(req.topics, (loaded, total) => post({ type: "progress", phase: "decode", loaded, total }));
      const transfer: Transferable[] = [];
      for (const c of columns) {
        transfer.push(c.t.buffer);
        for (const a of Object.values(c.num)) transfer.push(a.buffer);
      }
      post({ type: "data", id: req.id, columns, ms: performance.now() - t0 }, transfer);
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err), id: req.type === "load" ? req.id : undefined });
  }
};

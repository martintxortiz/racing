import { McapIndexedReader } from "@mcap/core";
import { ZSTDDecoder } from "zstddec";
import { ColumnBuilder, fieldsFromSchema, topicEntity } from "./columns";
import type { Columns, FileSummary, TopicInfo } from "./types";

export type Readable = { size(): Promise<bigint>; read(offset: bigint, length: bigint): Promise<Uint8Array> };
type ChunkIndex = McapIndexedReader["chunkIndexes"][number];
type Progress = (loaded: number, total: number) => void;

const decoder = new TextDecoder();
let zstd: ZSTDDecoder | null = null;
async function zstdReady(): Promise<ZSTDDecoder> {
  if (!zstd) {
    const d = new ZSTDDecoder();
    await d.init();
    zstd = d;
  }
  return zstd;
}

/**
 * One open .mcap. Reads the summary on open, then decodes topics on request in one pass over
 * the chunks that hold them. Chunks are decompressed again per request (zstd in WASM is fast,
 * and a race file is close to 1 GB uncompressed); message indexes are cached.
 */
export class McapSession {
  private reader!: McapIndexedReader;
  private base = 0n;
  private topics = new Map<string, TopicInfo>();
  private indexCache = new Map<string, [bigint, bigint][]>();

  private constructor(private source: Readable) {}

  static async open(source: Readable, name: string): Promise<{ session: McapSession; summary: FileSummary }> {
    const s = new McapSession(source);
    const summary = await s.init(name);
    return { session: s, summary };
  }

  private async init(name: string): Promise<FileSummary> {
    const z = await zstdReady();
    this.reader = await McapIndexedReader.Initialize({
      readable: this.source,
      decompressHandlers: { zstd: (data, size) => z.decode(data, Number(size)) },
    });
    const stats = this.reader.statistics;
    if (!stats) throw new Error("This .mcap has no summary section. Re-write it with an index.");
    this.base = stats.messageStartTime;
    const counts = stats.channelMessageCounts;
    for (const [id, ch] of this.reader.channelsById) {
      const schema = this.reader.schemasById.get(ch.schemaId);
      const count = Number(counts.get(id) ?? 0n);
      const prev = this.topics.get(ch.topic);
      if (prev) {
        prev.count += count;
        continue;
      }
      const parsed = schema && schema.encoding === "jsonschema" ? fieldsFromSchema(decoder.decode(schema.data)) : { fields: [], rows: false };
      this.topics.set(ch.topic, { name: ch.topic, schema: schema?.name ?? "", count, ...parsed, ...topicEntity(ch.topic) });
    }
    const metadata: Record<string, Record<string, string>> = {};
    for (const idx of this.reader.metadataIndexes) {
      for await (const m of this.reader.readMetadata({ name: idx.name })) metadata[m.name] = Object.fromEntries(m.metadata);
    }
    return {
      name,
      bytes: Number(await this.source.size()),
      startNs: this.base.toString(),
      duration: Number(stats.messageEndTime - stats.messageStartTime) / 1e9,
      topics: [...this.topics.values()].sort((a, b) => a.name.localeCompare(b.name)),
      metadata,
    };
  }

  async load(topics: string[], onProgress?: Progress): Promise<Columns[]> {
    const wanted = new Set(topics.filter((t) => this.topics.has(t)));
    const builders = new Map<number, { b: ColumnBuilder; rows: boolean; topic: string }>();
    for (const [cid, ch] of this.reader.channelsById) {
      if (!wanted.has(ch.topic)) continue;
      const info = this.topics.get(ch.topic)!;
      builders.set(cid, { b: new ColumnBuilder(ch.topic, info.fields), rows: info.rows, topic: ch.topic });
    }
    const chunks = this.reader.chunkIndexes
      .filter((c) => [...c.messageIndexOffsets.keys()].some((cid) => builders.has(cid)))
      .sort((a, b) => (a.messageStartTime < b.messageStartTime ? -1 : 1));
    let done = 0;
    for (const ci of chunks) {
      const data = await this.chunkData(ci);
      for (const [cid, entry] of builders) {
        if (!ci.messageIndexOffsets.has(cid)) continue;
        for (const [logTime, offset] of await this.messageIndex(ci, cid)) {
          const o = Number(offset);
          const view = new DataView(data.buffer, data.byteOffset + o, 9);
          // Message record: opcode(1) length(8) channel(2) sequence(4) logTime(8) publishTime(8) data
          const len = Number(view.getBigUint64(1, true));
          const msg = JSON.parse(decoder.decode(data.subarray(o + 31, o + 9 + len))) as Record<string, unknown>;
          const t = Number(logTime - this.base) / 1e9;
          if (entry.rows && Array.isArray(msg.rows)) for (const row of msg.rows as Record<string, unknown>[]) entry.b.push(t, row);
          else entry.b.push(t, msg);
        }
      }
      done++;
      if (onProgress && done % 4 === 0) onProgress(done, chunks.length);
    }
    const byTopic = new Map<string, Columns[]>();
    for (const { b, topic } of builders.values()) byTopic.set(topic, [...(byTopic.get(topic) ?? []), b.build()]);
    const out: Columns[] = [];
    for (const t of wanted) {
      const cs = byTopic.get(t);
      out.push(!cs ? emptyColumns(t) : cs.length === 1 ? cs[0] : mergeColumns(cs));
    }
    return out;
  }

  private async chunkData(ci: ChunkIndex): Promise<Uint8Array> {
    const raw = await this.source.read(ci.chunkStartOffset, ci.chunkLength);
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    // Chunk: opcode(1) length(8) start(8) end(8) uncompressedSize(8) crc(4) compression(str) records(u64 + bytes)
    let p = 25;
    const uncompressedSize = view.getBigUint64(p, true);
    p += 12;
    const clen = view.getUint32(p, true);
    p += 4;
    const compression = decoder.decode(raw.subarray(p, p + clen));
    p += clen;
    const recLen = Number(view.getBigUint64(p, true));
    p += 8;
    const records = raw.subarray(p, p + recLen);
    if (compression === "") return records;
    if (compression === "zstd") return (await zstdReady()).decode(records, Number(uncompressedSize));
    throw new Error(`Unsupported chunk compression "${compression}"`);
  }

  /** [logTime, offset into decompressed records] for one channel in one chunk. */
  private async messageIndex(ci: ChunkIndex, cid: number): Promise<[bigint, bigint][]> {
    const key = `${ci.chunkStartOffset}:${cid}`;
    const hit = this.indexCache.get(key);
    if (hit) return hit;
    const off = ci.messageIndexOffsets.get(cid)!;
    // MessageIndex: opcode(1) length(8) channel(2) entriesLength(4) [logTime(8) offset(8)]*
    const head = await this.source.read(off, 15n);
    const recLen = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(11, true);
    const body = await this.source.read(off + 15n, BigInt(recLen));
    const bv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const out: [bigint, bigint][] = [];
    for (let i = 0; i + 16 <= recLen; i += 16) out.push([bv.getBigUint64(i, true), bv.getBigUint64(i + 8, true)]);
    out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    this.indexCache.set(key, out);
    return out;
  }
}

export function emptyColumns(topic: string): Columns {
  return { topic, n: 0, t: new Float64Array(0), num: {}, str: {}, json: {} };
}

function mergeColumns(cs: Columns[]): Columns {
  const n = cs.reduce((s, c) => s + c.n, 0);
  const order: [number, number, number][] = [];
  cs.forEach((c, ci) => c.t.forEach((t, i) => order.push([t, ci, i])));
  order.sort((a, b) => a[0] - b[0]);
  const out: Columns = { topic: cs[0].topic, n, t: new Float64Array(n), num: {}, str: {}, json: {} };
  for (const k of new Set(cs.flatMap((c) => Object.keys(c.num)))) out.num[k] = new Float64Array(n).fill(NaN);
  for (const k of new Set(cs.flatMap((c) => Object.keys(c.str)))) out.str[k] = new Array(n).fill(null);
  for (const k of new Set(cs.flatMap((c) => Object.keys(c.json)))) out.json[k] = new Array(n).fill(null);
  order.forEach(([t, ci, i], j) => {
    out.t[j] = t;
    const c = cs[ci];
    for (const k in c.num) out.num[k][j] = c.num[k][i];
    for (const k in c.str) out.str[k][j] = c.str[k][i];
    for (const k in c.json) out.json[k][j] = c.json[k][i];
  });
  return out;
}

export function fileReadable(file: Blob): Readable {
  return {
    size: async () => BigInt(file.size),
    read: async (offset, length) => new Uint8Array(await file.slice(Number(offset), Number(offset + length)).arrayBuffer()),
  };
}

export function bufferReadable(buf: Uint8Array): Readable {
  return {
    size: async () => BigInt(buf.byteLength),
    read: async (offset, length) => buf.subarray(Number(offset), Number(offset + length)),
  };
}

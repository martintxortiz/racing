import { describe, expect, it } from "vitest";
import { groupSessions, summaryFromDetails, wsUrl, type ApiSession, type ApiSessionDetails } from "@/data/api";
import { createSource, ServerSource, specFromParams, WorkerSource } from "@/data/source";
import { StreamConnection, StreamStore, type Frame, type SocketLike } from "@/data/stream";

const schema = (props: Record<string, string>) => JSON.stringify({ type: "object", properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, { type: v }])) });

const details: ApiSessionDetails = {
  id: "2026-01_testland-race",
  name: "race.mcap",
  series: "F1",
  season: 2026,
  round: 1,
  event: "Testland Grand Prix",
  session: "Race",
  start_ns: 1_000_000_000_000_000_000,
  start_ns_str: "1000000000000000001",
  end_ns: 1_000_000_120_000_000_000,
  duration: 120,
  live: false,
  metadata: { session: { date_start_ns: "1000000010000000001" } },
  topics: [
    { name: "/car/1/position", schema_name: "f1.position", schema: schema({ x: "number", y: "number" }), encoding: "jsonschema", count: 480 },
    { name: "/timing/laps", schema_name: "f1.laps", schema: schema({ driver_number: "integer", lap_number: "integer" }), encoding: "jsonschema", count: 22 },
  ],
};

function store() {
  const s = summaryFromDetails(details);
  return new StreamStore(new Map(s.topics.map((t) => [t.name, t])));
}

describe("StreamStore", () => {
  it("shows the snapshot until history arrives, then only the history", () => {
    const st = store();
    st.apply({ type: "snapshot", t: 30, topics: ["/car/1/position"], msgs: [["/car/1/position", 30, { x: 9, y: 9 }]] });
    let c = st.columns("/car/1/position");
    expect([...c.t]).toEqual([30]);
    st.apply({ type: "batch", kind: "history", msgs: [["/car/1/position", 10, { x: 1, y: 1 }], ["/car/1/position", 20, { x: 2, y: 2 }]] });
    // History so far ends before the snapshot: the snapshot row still shows the latest state.
    expect([...st.columns("/car/1/position").t]).toEqual([10, 20, 30]);
    st.apply({ type: "batch", kind: "history", msgs: [["/car/1/position", 30, { x: 9, y: 9 }]] });
    st.apply({ type: "history_done", t: 30, topics: ["/car/1/position"] });
    c = st.columns("/car/1/position");
    expect([...c.t]).toEqual([10, 20, 30]);
    expect([...c.num.x]).toEqual([1, 2, 9]);
  });

  it("appends stream batches in order, drops stale ones and reports dirty topics once", () => {
    const st = store();
    st.apply({ type: "batch", kind: "stream", clock: 5, msgs: [["/car/1/position", 4, { x: 4, y: 0 }]] });
    st.apply({ type: "batch", kind: "stream", clock: 6, msgs: [["/car/1/position", 3, { x: 3, y: 0 }], ["/car/1/position", 6, { x: 6, y: 0 }]] });
    expect([...st.columns("/car/1/position").num.x]).toEqual([4, 6]);
    expect(st.clock).toBe(6);
    expect(st.takeDirty().map((c) => c.topic)).toEqual(["/car/1/position"]);
    expect(st.takeDirty()).toEqual([]);
  });

  it("tracks the live head from hello, live batches and state", () => {
    const st = store();
    st.apply({ type: "hello", session: "x", start_ns: "1", duration: 50, live: true, topics: [] });
    expect(st.head).toBe(50);
    st.apply({ type: "batch", kind: "live", clock: 52, msgs: [] });
    st.apply({ type: "state", t: 51, head: 51, playing: true, speed: 1, live: true, ack: 3 });
    expect(st.head).toBe(52);
    expect(st.acked).toBe(3);
  });
});

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  constructor(
    readonly url: string,
    private serve: (cmd: Record<string, unknown>, sock: FakeSocket) => void,
  ) {
    queueMicrotask(() => this.emit({ type: "hello", session: details.id, start_ns: details.start_ns_str!, duration: 120, live: false, topics: [] }));
  }
  emit(f: Frame) {
    this.onmessage?.({ data: JSON.stringify(f) });
  }
  send(data: string) {
    const cmd = JSON.parse(data);
    this.sent.push(cmd);
    queueMicrotask(() => this.serve(cmd, this));
  }
  close() {
    this.closed = true;
  }
}

describe("StreamConnection", () => {
  function connect(o: { live?: boolean } = {}) {
    let sock!: FakeSocket;
    const conn = new StreamConnection({
      base: "http://api.test",
      id: details.id,
      live: !!o.live,
      flushMs: 0,
      details: async () => details,
      socket: (url) =>
        (sock = new FakeSocket(url, (cmd, s) => {
          if (cmd.op === "subscribe") {
            s.emit({ type: "batch", kind: "history", msgs: [["/timing/laps", 10, { driver_number: 1, lap_number: 1 }]] });
            s.emit({ type: "history_done", t: 120, topics: cmd.topics as string[] });
          }
          s.emit({ type: "state", t: 10, playing: false, speed: 1, live: false, ack: cmd.id as number });
        })),
    });
    return { conn, sock: () => sock };
  }

  it("opens on the scheduled start, keeps ns precision and loads whole timing topics", async () => {
    const { conn, sock } = connect();
    const summary = await conn.open();
    expect(sock().url).toBe("ws://api.test/api/sessions/2026-01_testland-race/stream");
    expect(summary.startNs).toBe("1000000000000000001");
    expect(sock().sent[0]).toMatchObject({ op: "seek", t: 10 });
    const [laps] = await conn.load(["/timing/laps"]);
    expect(laps.n).toBe(1);
    expect(sock().sent[1]).toMatchObject({ op: "subscribe", topics: ["/timing/laps"], mode: "history", full: true });
    await conn.load(["/car/1/position", "/nope"], 8);
    expect(sock().sent[2]).toMatchObject({ op: "subscribe", topics: ["/car/1/position"], since: 8 });
    expect(sock().sent[2].full).toBeUndefined();
    conn.dispose();
    expect(sock().closed).toBe(true);
  });

  it("asks the server for live and ignores transport controls there", async () => {
    const { conn, sock } = connect({ live: true });
    await conn.open();
    expect(sock().url).toContain("?live=true");
    const before = sock().sent.length;
    conn.control({ op: "pause" });
    expect(sock().sent.length).toBe(before);
  });

  it("reports a dropped connection as an update", async () => {
    const { conn, sock } = connect();
    await conn.open();
    const updates: (string | undefined)[] = [];
    conn.onUpdate = (u) => updates.push(u.closed);
    sock().onclose?.({ code: 1006, reason: "" });
    expect(updates).toEqual(["The stream disconnected."]);
  });
});

describe("sources", () => {
  it("reads replay, live and file sources from the address", () => {
    const href = "http://localhost:3000/";
    expect(specFromParams(new URLSearchParams("api=abc&t=42"), href)).toMatchObject({ kind: "replay", id: "abc", t: 42 });
    expect(specFromParams(new URLSearchParams("api=abc&live=1&speed=4&apiBase=http://h:9"), href)).toMatchObject({ kind: "live", id: "abc", speed: 4, base: "http://h:9" });
    expect(specFromParams(new URLSearchParams("src=/data/a.mcap"), href)).toEqual({ kind: "url", url: "http://localhost:3000/data/a.mcap" });
    expect(specFromParams(new URLSearchParams(""), href)).toBeNull();
  });

  it("picks the worker for files and the server stream for sessions", () => {
    expect(createSource({ kind: "url", url: "http://x/a.mcap" })).toBeInstanceOf(WorkerSource);
    const s = createSource({ kind: "live", id: "abc" });
    expect(s).toBeInstanceOf(ServerSource);
    expect(s.streaming && s.live).toBe(true);
    expect(() => createSource({ kind: "replay" })).toThrow();
  });

  it("builds ws urls and groups sessions by event, live first", () => {
    expect(wsUrl("https://h:1", "/s")).toBe("wss://h:1/s");
    const mk = (id: string, round: number, event: string, live = false): ApiSession => ({
      id,
      series: "F1",
      season: 2026,
      round,
      event,
      session: id,
      start_ns: round,
      end_ns: round + 1,
      duration: 1,
      topics: [],
      live,
    });
    const groups = groupSessions([mk("a", 1, "One"), mk("b", 2, "Two"), mk("c", 1, "One"), mk("live-a", 1, "One", true)]);
    expect(groups[0].live).toBe(true);
    expect(groups.slice(1).map((g) => g.title)).toEqual(["Two", "One"]);
    expect(groups[2].sessions.map((s) => s.id).sort()).toEqual(["a", "c"]);
  });
});

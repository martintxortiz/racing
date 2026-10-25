"""Live sessions: a producer pushes messages, subscribed clients receive them as they arrive.

A `LiveSource` is anything that produces messages for one session: the bundled
`SimulatedLiveSource` replays a recording in real time, `IngestSource` accepts messages pushed
over a WebSocket. Future feeds (OpenF1 live, F1 25 / LMU / AC UDP telemetry) are further
subclasses: declare topics and schemas, then call `sink.publish(topic, log_time_ns, json_text)`
from `run()`. See server/README.md, "Adding a live source".
"""

from __future__ import annotations

import abc
import asyncio
import json
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any, Protocol

from starlette.websockets import WebSocket, WebSocketDisconnect

from .frames import Encoder
from .index import SessionEntry
from .reader import LightCache, Msg, SessionReader, TopicLog
from .stream import take


@dataclass
class TopicDecl:
    name: str
    schema_name: str = ""
    schema: str = "{}"
    encoding: str = "json"


class History(Protocol):
    """Read access to what a live session has already produced (one per client, any thread)."""

    def messages(self, topics: Iterable[str], after_ns: int | None = None, until_ns: int | None = None) -> Iterator[Msg]: ...
    def snapshot(self, topics: Iterable[str], t_ns: int) -> list[Msg]: ...
    def close(self) -> None: ...


class Sink(Protocol):
    def publish(self, topic: str, log_time_ns: int, data: str) -> None: ...
    def advance(self, head_ns: int) -> None: ...


class LiveSource(abc.ABC):
    """A producer of messages for one live session."""

    id: str
    title: str = "Live"
    start_ns: int = 0
    metadata: dict[str, dict[str, str]]
    topics: dict[str, TopicDecl]

    @abc.abstractmethod
    async def run(self, sink: Sink) -> None:
        """Produce messages until the feed ends (or the task is cancelled)."""

    def open_history(self) -> History | None:
        """Return a reader over already-produced messages, or None to use the hub's memory buffer."""
        return None

    #: Reference topics (driver list, track outline...) known before the feed starts: a new
    #: subscriber gets their whole log at once, whatever its timestamps.
    reference: frozenset[str] = frozenset()


class SimulatedLiveSource(LiveSource):
    """Replays a recording at wall-clock pace (x `speed`), as if it were being received live.

    Messages keep their original log times, so the session info and timing in the file stay
    consistent. Everything before `from_s` counts as already received when the session starts.
    """

    def __init__(self, entry: SessionEntry, cache: LightCache, from_s: float | None = None, speed: float = 1.0, sid: str | None = None):
        self.entry = entry
        self.cache = cache
        self.id = sid or f"live-{entry.id}"
        info = entry.info
        self.title = f"{info.get('event_name', entry.id)} · {info.get('session_name', '')} (simulated live)"
        self.start_ns = entry.start_ns
        self.metadata = entry.metadata
        self.topics = {t.name: TopicDecl(t.name, t.schema_name, t.schema, t.encoding) for t in entry.topics.values()}
        if from_s is None:
            sched = info.get("date_start_ns")
            from_s = entry.rel_seconds(int(sched)) - 120 if sched and sched.isdigit() else 0.0
        self.from_s = min(max(from_s, 0.0), entry.duration)
        self.speed = speed
        self.done = False
        # One-message topics are reference data, except outcomes (stints, results) that a real
        # feed only has once the session is over; those arrive when their log time comes.
        self.reference = frozenset(
            t.name for t in entry.topics.values() if t.count <= 1 and not t.name.startswith(("/stints", "/results"))
        )

    def open_history(self) -> History:
        return SessionReader(self.entry, self.cache)

    async def run(self, sink: Sink) -> None:
        reader = SessionReader(self.entry, self.cache)
        try:
            head = self.entry.abs_ns(self.from_s)
            sink.advance(head)
            # Build the shared light cache off the event loop before the first pull.
            await asyncio.to_thread(lambda: reader.light)
            it = reader.messages(sorted(set(self.topics) - self.reference), head)
            peek: list[Msg] = []
            wall0, t0 = time.monotonic(), self.from_s
            while True:
                now_s = min(t0 + (time.monotonic() - wall0) * self.speed, self.entry.duration)
                until = self.entry.abs_ns(now_s)
                while True:
                    msgs, done = await asyncio.to_thread(take, it, peek, until, 5000)
                    for topic, ns, data in msgs:
                        sink.publish(topic, ns, data)
                    if done:
                        break
                sink.advance(until)
                if now_s >= self.entry.duration:
                    self.done = True
                    return
                await asyncio.sleep(0.05)
        finally:
            reader.close()


class IngestSource(LiveSource):
    """Messages pushed by an external producer over WS /api/live/{id}/ingest."""

    def __init__(self, sid: str, hello: dict[str, Any]):
        self.id = sid
        self.title = hello.get("title") or sid
        self.start_ns = int(hello.get("start_ns") or time.time_ns())
        md = hello.get("metadata") or {}
        self.metadata = {k: {kk: str(vv) for kk, vv in v.items()} for k, v in md.items()} if isinstance(md, dict) else {}
        self.topics = {}
        for name, d in (hello.get("topics") or {}).items():
            d = d or {}
            schema = d.get("schema", {})
            self.topics[name] = TopicDecl(name, d.get("schema_name", ""), schema if isinstance(schema, str) else json.dumps(schema))
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=10000)

    async def run(self, sink: Sink) -> None:
        while True:
            item = await self.queue.get()
            if item is None:
                return
            topic, ns, data = item
            if topic not in self.topics:
                self.topics[topic] = TopicDecl(topic)
            sink.publish(topic, ns, data)


class BufferHistory:
    """History over the hub's in-memory per-topic logs."""

    def __init__(self, logs: dict[str, TopicLog]):
        self.logs = logs

    def messages(self, topics, after_ns=None, until_ns=None):
        import heapq

        its = [self.logs[t].range(t, after_ns, until_ns) for t in topics if t in self.logs]
        return heapq.merge(*its, key=lambda m: m[1])

    def snapshot(self, topics, t_ns):
        out = []
        for t in topics:
            log = self.logs.get(t)
            hit = log.latest(t_ns) if log else None
            if hit:
                out.append((t, hit[1], hit[2]))
        return sorted(out, key=lambda m: m[1])

    def close(self):
        pass


@dataclass(eq=False)
class Subscriber:
    topics: set[str]
    pending: list[Msg] = field(default_factory=list)
    pending_bytes: int = 0
    lagging: bool = False
    wake: asyncio.Event = field(default_factory=asyncio.Event)


class LiveSession:
    """Fan-out hub for one live source."""

    def __init__(self, source: LiveSource, buffer_limit: int = 512 << 20, client_limit: int = 64 << 20):
        self.source = source
        self.head_ns = source.start_ns
        self.subs: set[Subscriber] = set()
        self.logs: dict[str, TopicLog] = {}
        self.buffer_bytes = 0
        self.buffer_limit = buffer_limit
        self.client_limit = client_limit
        self.buffer_full = False
        self.counts: dict[str, int] = {}
        self.task: asyncio.Task | None = None
        self.started = time.time()
        probe = source.open_history()
        self._file_backed = probe is not None
        if probe is not None:
            probe.close()

    @property
    def id(self) -> str:
        return self.source.id

    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def start(self) -> None:
        self.task = asyncio.create_task(self.source.run(self))

    async def stop(self) -> None:
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except (asyncio.CancelledError, Exception):
                pass

    # Sink ------------------------------------------------------------------
    def publish(self, topic: str, ns: int, data: str) -> None:
        if ns > self.head_ns:
            self.head_ns = ns
        self.counts[topic] = self.counts.get(topic, 0) + 1
        if not self._file_backed and not self.buffer_full:
            log = self.logs.setdefault(topic, TopicLog())
            log.ns.append(ns)
            log.data.append(data)
            self.buffer_bytes += len(data) + 32
            self.buffer_full = self.buffer_bytes > self.buffer_limit
        m = (topic, ns, data)
        for s in self.subs:
            if topic in s.topics and not s.lagging:
                s.pending.append(m)
                s.pending_bytes += len(data)
                if s.pending_bytes > self.client_limit:
                    s.lagging = True  # the client cannot keep up; its handler disconnects it
                s.wake.set()

    def advance(self, head_ns: int) -> None:
        if head_ns > self.head_ns:
            self.head_ns = head_ns
        for s in self.subs:
            s.wake.set()

    def history(self) -> History:
        return self.source.open_history() or BufferHistory(self.logs)

    def listing(self) -> dict[str, Any]:
        info = self.source.metadata.get("session", {})
        return {
            "id": self.id,
            "series": info.get("series", "F1"),
            "season": int(info["season"]) if info.get("season", "").isdigit() else None,
            "round": int(info["round"]) if info.get("round", "").isdigit() else None,
            "event": info.get("event_name") or self.source.title,
            "country": info.get("country"),
            "location": info.get("location"),
            "circuit": info.get("circuit_short_name"),
            "session": info.get("session_name") or "Live",
            "session_type": info.get("session_type"),
            "title": self.source.title,
            "start_ns": self.source.start_ns,
            "start_ns_str": str(self.source.start_ns),
            "end_ns": self.head_ns,
            "head": (self.head_ns - self.source.start_ns) / 1e9,
            "duration": (self.head_ns - self.source.start_ns) / 1e9,
            "topics": sorted(self.source.topics),
            "live": True,
            "running": self.running,
            "clients": len(self.subs),
            "gmt_offset": info.get("gmt_offset"),
        }

    def details(self) -> dict[str, Any]:
        out = self.listing()
        out["topics"] = [
            {"name": d.name, "schema_name": d.schema_name, "schema": d.schema, "encoding": d.encoding, "count": self.counts.get(d.name, 0)}
            for d in sorted(self.source.topics.values(), key=lambda d: d.name)
        ]
        out["metadata"] = self.source.metadata
        out["name"] = self.id
        return out


class LiveStream:
    """Per-client handler for a live session: history up to the join point, then messages as they arrive."""

    def __init__(self, ws: WebSocket, hub: LiveSession, batch_s: float = 0.05, history_batch: int = 20000):
        self.ws = ws
        self.hub = hub
        self.enc = Encoder(hub.source.start_ns)
        self.batch_s = batch_s
        self.history_batch = history_batch
        self.sub = Subscriber(topics=set())
        self.history = hub.history()
        self.cmds: asyncio.Queue = asyncio.Queue()

    def state(self, ack=None) -> str:
        head = self.enc.rel(self.hub.head_ns)
        extra = {"ack": ack} if ack is not None else {}
        return self.enc.frame("state", t=head, head=head, playing=True, speed=getattr(self.hub.source, "speed", 1), live=True, running=self.hub.running, **extra)

    async def run(self) -> None:
        hub = self.hub
        hub.subs.add(self.sub)
        recv = asyncio.create_task(self._recv())
        try:
            await self.ws.send_text(
                self.enc.frame("hello", session=hub.id, start_ns=str(hub.source.start_ns), duration=self.enc.rel(hub.head_ns), live=True, topics=sorted(hub.source.topics))
            )
            last_state = 0.0
            while True:
                while not self.cmds.empty():
                    cmd = self.cmds.get_nowait()
                    if cmd is None:
                        return
                    await self.apply(cmd)
                if self.sub.lagging:
                    await self.ws.send_text(self.enc.frame("error", message="client too slow for the live feed; reconnect to resync"))
                    await self.ws.close(code=1013)
                    return
                if self.sub.pending:
                    msgs, self.sub.pending, self.sub.pending_bytes = self.sub.pending, [], 0
                    await self.ws.send_text(self.enc.frame("batch", msgs, kind="live", clock=self.enc.rel(hub.head_ns)))
                now = time.monotonic()
                if now - last_state > 0.5:
                    last_state = now
                    await self.ws.send_text(self.state())
                self.sub.wake.clear()
                try:
                    await asyncio.wait_for(self.sub.wake.wait(), timeout=0.5)
                except TimeoutError:
                    pass
                await asyncio.sleep(self.batch_s)  # batch whatever arrives in the next ~50 ms
        except WebSocketDisconnect:
            pass
        finally:
            hub.subs.discard(self.sub)
            recv.cancel()
            self.history.close()

    async def _recv(self) -> None:
        try:
            while True:
                await self.cmds.put(await self.ws.receive_json())
        except Exception:
            await self.cmds.put(None)

    async def apply(self, cmd: dict) -> None:
        op = cmd.get("op")
        if op == "subscribe":
            new = sorted(set(cmd.get("topics", [])) - self.sub.topics)
            if not new:
                await self.ws.send_text(self.state(cmd.get("id")))
                return
            # Join first so nothing published while history is read can be missed, then
            # send history up to the join point; live messages after it follow from `pending`.
            join = self.hub.head_ns
            ref = sorted(t for t in new if t in self.hub.source.reference)
            if ref:
                msgs = await asyncio.to_thread(lambda: list(self.history.messages(ref)))
                await self.ws.send_text(self.enc.frame("static", msgs))
                new = [t for t in new if t not in self.hub.source.reference]
                if not new:
                    await self.ws.send_text(self.state(cmd.get("id")))
                    return
            self.sub.topics.update(new)
            self.sub.pending = [m for m in self.sub.pending if m[0] not in new or m[1] > join]
            snap = await asyncio.to_thread(self.history.snapshot, new, join)
            await self.ws.send_text(self.enc.frame("snapshot", snap, t=self.enc.rel(join), topics=new))
            if cmd.get("mode", "history") == "history":
                it = None
                peek: list[Msg] = []
                done = False
                while not done:
                    def step():
                        nonlocal it
                        if it is None:
                            since = cmd.get("since")
                            after = None if since is None else self.hub.source.start_ns + round(float(since) * 1e9) - 1
                            it = self.history.messages(new, after, join)
                        return take(it, peek, join, self.history_batch)

                    msgs, done = await asyncio.to_thread(step)
                    if msgs:
                        await self.ws.send_text(self.enc.frame("batch", msgs, kind="history"))
                await self.ws.send_text(self.enc.frame("history_done", t=self.enc.rel(join), topics=new))
            await self.ws.send_text(self.state(cmd.get("id")))
        elif op == "unsubscribe":
            self.sub.topics -= set(cmd.get("topics", []))
            await self.ws.send_text(self.state(cmd.get("id")))
        else:
            # play / pause / seek / speed are client-side in live mode: the feed never stops.
            await self.ws.send_text(self.state(cmd.get("id")))


class LiveRegistry:
    def __init__(self) -> None:
        self.sessions: dict[str, LiveSession] = {}

    def add(self, source: LiveSource) -> LiveSession:
        hub = LiveSession(source)
        self.sessions[source.id] = hub
        hub.start()
        return hub

    def get(self, sid: str) -> LiveSession | None:
        return self.sessions.get(sid)

    async def remove(self, sid: str) -> bool:
        hub = self.sessions.pop(sid, None)
        if hub:
            await hub.stop()
        return hub is not None

    async def close(self) -> None:
        for sid in list(self.sessions):
            await self.remove(sid)

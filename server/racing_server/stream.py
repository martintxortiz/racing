"""Per-client replay stream over a WebSocket.

Client -> server commands (JSON):
  {"op": "subscribe", "topics": [...], "mode": "history" | "snapshot", "since": seconds?, "full": bool?}
  {"op": "unsubscribe", "topics": [...]}
  {"op": "play"} | {"op": "pause"}
  {"op": "seek", "t": seconds}
  {"op": "speed", "x": 4}
Any command may carry "id"; the `state` frame that ends its handling echoes it as "ack".

Server -> client frames: hello, static, snapshot, batch (kind history | stream), history_done,
state, end, error. See server/README.md for the full protocol.

Pacing: the server owns a replay clock (seconds since the session start). While playing, every
~50 ms it sends the subscribed messages with log time in (sent, clock + lead]. Sends are awaited,
so a slow client slows the producer instead of growing a queue (backpressure); when the client
falls behind, later batches simply cover a longer span, capped at `max_batch` messages each.

Coverage ("history" mode, used by the Workbench): the server tracks `sent_hi`, the log time up
to which every subscribed topic has been delivered on this connection. A seek past it first sends
a snapshot (latest message per topic, so the client can draw at once), then the history in
between, then `history_done`. A seek backwards sends nothing: the client already has that data.
In "snapshot" mode every seek sends only the snapshot and the stream restarts from there.

`full: true` sends the topics' whole log at once and then leaves them out of the stream, like
static topics. The Workbench does this for the small timing topics (laps, intervals, race
control...) so lap charts and the race trace can show the whole session, as with a local file.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator

from starlette.websockets import WebSocket, WebSocketDisconnect

from .frames import Encoder
from .index import SessionEntry
from .reader import LightCache, Msg, SessionReader

_CLOSED = object()


def take(it: Iterator[Msg], peek: list[Msg], until_ns: int | None, limit: int) -> tuple[list[Msg], bool]:
    """Pull up to `limit` messages with log time <= until_ns, never splitting one timestamp.

    `peek` holds at most one message read past the bound. Returns (messages, done) where done
    means everything up to until_ns has been taken.
    """
    out: list[Msg] = []
    while True:
        m = peek.pop() if peek else next(it, None)
        if m is None:
            return out, True
        if until_ns is not None and m[1] > until_ns:
            peek.append(m)
            return out, True
        if len(out) >= limit and m[1] != out[-1][1]:
            peek.append(m)
            return out, False
        out.append(m)


class ReplayStream:
    def __init__(
        self,
        ws: WebSocket,
        entry: SessionEntry,
        cache: LightCache,
        *,
        batch_s: float = 0.05,
        lead_s: float = 1.0,
        max_batch: int = 5000,
        history_batch: int = 20000,
    ):
        self.ws = ws
        self.entry = entry
        self.reader = SessionReader(entry, cache)
        self.enc = Encoder(entry.start_ns)
        self.batch_s = batch_s
        self.lead_s = lead_s
        self.max_batch = max_batch
        self.history_batch = history_batch
        self.mode = "history"
        self.topics: set[str] = set()  # streamed topics (static ones are sent once and excluded)
        self.static_sent: set[str] = set()
        self.sent_hi: int | None = None
        self.playing = False
        self.speed = 1.0
        self._t_ref = 0.0
        self._wall_ref = time.monotonic()
        self._it: Iterator[Msg] | None = None
        self._peek: list[Msg] = []
        self._ended = False
        self.cmds: asyncio.Queue = asyncio.Queue()

    # clock -----------------------------------------------------------------
    def clock(self) -> float:
        t = self._t_ref
        if self.playing:
            t += (time.monotonic() - self._wall_ref) * self.speed
        return min(max(t, 0.0), self.entry.duration)

    def _set_clock(self, t: float) -> None:
        self._t_ref = min(max(t, 0.0), self.entry.duration)
        self._wall_ref = time.monotonic()

    async def send(self, text: str) -> None:
        await self.ws.send_text(text)

    async def send_state(self, ack=None) -> None:
        extra = {"ack": ack} if ack is not None else {}
        await self.send(self.enc.frame("state", t=round(self.clock(), 6), playing=self.playing, speed=self.speed, live=False, **extra))

    # main loop -------------------------------------------------------------
    async def run(self) -> None:
        recv = asyncio.create_task(self._recv())
        try:
            await self.send(
                self.enc.frame(
                    "hello",
                    session=self.entry.id,
                    start_ns=str(self.entry.start_ns),
                    duration=self.entry.duration,
                    live=False,
                    topics=sorted(self.entry.topics),
                )
            )
            last_state = 0.0
            busy = False
            while True:
                timeout = 0 if busy else (self.batch_s if self.playing else 1.0)
                try:
                    cmd = await asyncio.wait_for(self.cmds.get(), timeout=timeout) if timeout else self.cmds.get_nowait()
                except (TimeoutError, asyncio.QueueEmpty):
                    cmd = None
                while cmd is not None:
                    if cmd is _CLOSED:
                        return
                    await self.apply(cmd)
                    cmd = None if self.cmds.empty() else self.cmds.get_nowait()
                busy = await self.pump()
                now = time.monotonic()
                if self.playing and now - last_state > 1.0:
                    last_state = now
                    await self.send_state()
        except WebSocketDisconnect:
            pass
        finally:
            recv.cancel()
            self.reader.close()

    async def _recv(self) -> None:
        try:
            while True:
                await self.cmds.put(await self.ws.receive_json())
        except Exception:
            await self.cmds.put(_CLOSED)

    async def apply(self, cmd: dict) -> None:
        op = cmd.get("op")
        if op == "subscribe":
            if cmd.get("mode") in ("history", "snapshot"):
                self.mode = cmd["mode"]
            since = cmd.get("since")
            topics = [t for t in cmd.get("topics", []) if t in self.entry.topics]
            if cmd.get("full"):
                await self.subscribe_full(topics)
            else:
                await self.subscribe(topics, None if since is None else float(since))
        elif op == "unsubscribe":
            drop = set(cmd.get("topics", []))
            self.topics -= drop
            self._reset_iter()
        elif op == "play":
            self._set_clock(self.clock())
            self.playing = True
            self._ended = False
        elif op == "pause":
            self._set_clock(self.clock())
            self.playing = False
        elif op == "speed":
            x = float(cmd.get("x", 1))
            self._set_clock(self.clock())
            self.speed = min(max(x, 0.01), 1000.0)
        elif op == "seek":
            await self.seek(float(cmd.get("t", 0)))
        else:
            await self.send(self.enc.frame("error", message=f"unknown op {op!r}"))
        await self.send_state(cmd.get("id"))

    # data ------------------------------------------------------------------
    def _reset_iter(self) -> None:
        self._it = None
        self._peek = []

    async def _send_static(self, topics: list[str]) -> None:
        static = [t for t in self.reader.static_topics(topics) if t not in self.static_sent]
        if not static:
            return
        msgs = await asyncio.to_thread(lambda: list(self.reader.messages(static)))
        self.static_sent.update(static)
        await self.send(self.enc.frame("static", msgs))

    async def _send_snapshot(self, topics: list[str], t_ns: int) -> None:
        if not topics:
            return
        msgs = await asyncio.to_thread(self.reader.snapshot, topics, t_ns)
        await self.send(self.enc.frame("snapshot", msgs, t=self.enc.rel(t_ns), topics=topics))

    async def _send_history(self, topics: list[str], after_ns: int | None, until_ns: int) -> None:
        if topics:
            it: Iterator[Msg] | None = None
            peek: list[Msg] = []
            done = False
            while not done:
                def step():
                    nonlocal it
                    if it is None:
                        it = self.reader.messages(topics, after_ns, until_ns)
                    return take(it, peek, until_ns, self.history_batch)

                msgs, done = await asyncio.to_thread(step)
                if msgs:
                    await self.send(self.enc.frame("batch", msgs, kind="history"))
        await self.send(self.enc.frame("history_done", t=self.enc.rel(until_ns), topics=topics))

    async def subscribe(self, topics: list[str], since: float | None = None) -> None:
        """Add topics. In history mode their history is sent from `since` (seconds; default: the start)."""
        await self._send_static(topics)
        new = sorted(t for t in topics if t not in self.topics and t not in self.static_sent)
        if not new:
            return
        hi = self.sent_hi if self.sent_hi is not None else self.entry.abs_ns(self.clock())
        await self._send_snapshot(new, hi)
        if self.mode == "history":
            await self._send_history(new, None if since is None else self.entry.abs_ns(since) - 1, hi)
        self.topics.update(new)
        self.sent_hi = hi
        self._reset_iter()

    async def subscribe_full(self, topics: list[str]) -> None:
        """Send whole topics once; they are then complete and leave the stream."""
        await self._send_static(topics)
        new = sorted(t for t in topics if t not in self.static_sent)
        self.topics -= set(new)
        if new:
            await self._send_history(new, None, self.entry.end_ns)
            self.static_sent.update(new)
            self._reset_iter()

    async def seek(self, t: float) -> None:
        self._set_clock(t)
        self._ended = False
        t_ns = self.entry.abs_ns(self.clock())
        topics = sorted(self.topics)
        if self.mode == "snapshot":
            await self._send_snapshot(topics, t_ns)
            self.sent_hi = t_ns
            self._reset_iter()
            return
        if self.sent_hi is None:
            self.sent_hi = t_ns
            return
        if t_ns <= self.sent_hi:
            return  # the client already holds everything up to sent_hi
        if not topics:
            self.sent_hi = t_ns
            return
        await self._send_snapshot(topics, t_ns)
        await self._send_history(topics, self.sent_hi, t_ns)
        self.sent_hi = t_ns
        self._reset_iter()

    async def pump(self) -> bool:
        """Send due messages. Returns True when more are due right away (batch was capped)."""
        if not self.topics or self.sent_hi is None:
            return False
        clock = self.clock()
        target = self.entry.abs_ns(clock + (self.lead_s * max(1.0, self.speed ** 0.5) if self.playing else 0.0))
        target = min(target, self.entry.end_ns)
        if target > self.sent_hi:
            topics = sorted(self.topics)
            after = self.sent_hi

            def step():
                if self._it is None:
                    self._it = self.reader.messages(topics, after)
                return take(self._it, self._peek, target, self.max_batch)

            msgs, done = await asyncio.to_thread(step)
            self.sent_hi = target if done else msgs[-1][1]
            if msgs:
                await self.send(self.enc.frame("batch", msgs, kind="stream", clock=round(clock, 6)))
            if not done:
                return True
        if self.playing and clock >= self.entry.duration and not self._ended:
            self._ended = True
            self.playing = False
            self._set_clock(self.entry.duration)
            await self.send(self.enc.frame("end", t=self.entry.duration))
            await self.send_state()
        return False

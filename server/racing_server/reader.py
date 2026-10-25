"""Message access for one recording: time-range iteration, snapshots, and a shared light-topic cache.

Light topics (timing, events, results, static info) are a few MB per session but are spread over
every chunk of the file, so they are extracted once per session and kept in memory (and on disk).
Bulk topics (per-car telemetry and position, scene frames) are always read straight from the file
through the MCAP chunk index, so no client ever holds a whole file in memory.
"""

from __future__ import annotations

import bisect
import heapq
import json
import threading
from collections import OrderedDict
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import BinaryIO

import zstandard
from mcap.reader import make_reader

from .index import SessionEntry

# (topic, log_time_ns, raw JSON payload)
Msg = tuple[str, int, str]


def light_topics(entry: SessionEntry) -> list[str]:
    return sorted(t.name for t in entry.topics.values() if not t.bulk or t.count <= 1)


def is_light(entry: SessionEntry, topic: str) -> bool:
    t = entry.topics[topic]
    return not t.bulk or t.count <= 1


class TopicLog:
    """Sorted messages of one topic."""

    __slots__ = ("ns", "data")

    def __init__(self) -> None:
        self.ns: list[int] = []
        self.data: list[str] = []

    def latest(self, t_ns: int) -> Msg | None:
        i = bisect.bisect_right(self.ns, t_ns) - 1
        return (None, self.ns[i], self.data[i]) if i >= 0 else None  # type: ignore[return-value]

    def range(self, topic: str, after_ns: int | None, until_ns: int | None) -> Iterator[Msg]:
        lo = 0 if after_ns is None else bisect.bisect_right(self.ns, after_ns)
        hi = len(self.ns) if until_ns is None else bisect.bisect_right(self.ns, until_ns)
        for i in range(lo, hi):
            yield (topic, self.ns[i], self.data[i])


class LightCache:
    """Per-session light-topic logs, built once and shared by every client (LRU in memory)."""

    def __init__(self, cache_dir: str | Path | None = None, capacity: int = 8):
        self.dir = Path(cache_dir) if cache_dir else None
        self.capacity = capacity
        self._mem: OrderedDict[str, dict[str, TopicLog]] = OrderedDict()
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    def _key(self, e: SessionEntry) -> str:
        return f"{e.id}:{int(e.mtime)}:{e.bytes}"

    def get(self, e: SessionEntry) -> dict[str, TopicLog]:
        key = self._key(e)
        with self._guard:
            hit = self._mem.get(key)
            if hit is not None:
                self._mem.move_to_end(key)
                return hit
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            with self._guard:
                hit = self._mem.get(key)
                if hit is not None:
                    return hit
            logs = self._load_disk(e) or self._build(e)
            with self._guard:
                self._mem[key] = logs
                while len(self._mem) > self.capacity:
                    self._mem.popitem(last=False)
            return logs

    def _path(self, e: SessionEntry) -> Path | None:
        return self.dir / f"{e.id}.light.json.zst" if self.dir else None

    def _load_disk(self, e: SessionEntry) -> dict[str, TopicLog] | None:
        p = self._path(e)
        if not p or not p.exists():
            return None
        try:
            raw = json.loads(zstandard.ZstdDecompressor().decompress(p.read_bytes()))
            if raw.get("key") != self._key(e):
                return None
            logs: dict[str, TopicLog] = {}
            for name, (ns, data) in raw["topics"].items():
                log = TopicLog()
                log.ns, log.data = ns, data
                logs[name] = log
            return logs
        except Exception:
            return None

    def _build(self, e: SessionEntry) -> dict[str, TopicLog]:
        names = light_topics(e)
        logs = {n: TopicLog() for n in names}
        with e.path.open("rb") as f:
            for _, ch, m in make_reader(f).iter_messages(topics=names, log_time_order=True):
                log = logs[ch.topic]
                log.ns.append(m.log_time)
                log.data.append(m.data.decode("utf-8"))
        p = self._path(e)
        if p:
            try:
                p.parent.mkdir(parents=True, exist_ok=True)
                body = json.dumps({"key": self._key(e), "topics": {n: [l.ns, l.data] for n, l in logs.items()}})
                tmp = p.with_suffix(".tmp")
                tmp.write_bytes(zstandard.ZstdCompressor(level=3).compress(body.encode()))
                tmp.replace(p)
            except OSError:
                pass  # the cache is an optimisation only
        return logs


class SessionReader:
    """One open file handle plus the shared light cache. Not thread-safe: one per client."""

    def __init__(self, entry: SessionEntry, cache: LightCache):
        self.entry = entry
        self.cache = cache
        self._fh: BinaryIO | None = None
        self._reader = None

    def close(self) -> None:
        if self._fh:
            self._fh.close()
            self._fh = None
            self._reader = None

    @property
    def reader(self):
        if self._reader is None:
            self._fh = self.entry.path.open("rb")
            self._reader = make_reader(self._fh)
        return self._reader

    @property
    def light(self) -> dict[str, TopicLog]:
        return self.cache.get(self.entry)

    def split(self, topics: Iterable[str]) -> tuple[list[str], list[str]]:
        light, bulk = [], []
        for t in topics:
            if t in self.entry.topics:
                (light if is_light(self.entry, t) else bulk).append(t)
        return sorted(light), sorted(bulk)

    def static_topics(self, topics: Iterable[str]) -> list[str]:
        return sorted(t for t in topics if t in self.entry.topics and self.entry.topics[t].count <= 1)

    def messages(self, topics: Iterable[str], after_ns: int | None = None, until_ns: int | None = None) -> Iterator[Msg]:
        """Messages in (after_ns, until_ns], log-time order, ties broken by topic order in the file."""
        light, bulk = self.split(topics)
        its: list[Iterator[Msg]] = []
        if light:
            logs = self.light
            its.extend(logs[t].range(t, after_ns, until_ns) for t in light if t in logs)
        if bulk:
            its.append(self._file_range(bulk, after_ns, until_ns))
        if not its:
            return iter(())
        if len(its) == 1:
            return its[0]
        return heapq.merge(*its, key=lambda m: m[1])

    def _file_range(self, topics: list[str], after_ns: int | None, until_ns: int | None) -> Iterator[Msg]:
        for _, ch, m in self.reader.iter_messages(topics=topics, starting_after=after_ns, ending_at=until_ns, log_time_order=True):
            yield (ch.topic, m.log_time, m.data.decode("utf-8"))

    def snapshot(self, topics: Iterable[str], t_ns: int, lookback_s: float = 900.0) -> list[Msg]:
        """Latest message at or before t_ns for each topic, in log-time order.

        Bulk topics are found with one reverse scan over the chunks before t_ns, bounded by
        `lookback_s` so a car that stopped transmitting long ago does not force a full-file scan.
        """
        light, bulk = self.split(topics)
        out: list[Msg] = []
        logs = self.light if light else {}
        for t in light:
            log = logs.get(t)
            hit = log.latest(t_ns) if log else None
            if hit:
                out.append((t, hit[1], hit[2]))
        want = {t for t in bulk if self.entry.topics[t].first_ns <= t_ns}
        if want:
            start = max(self.entry.start_ns, t_ns - int(lookback_s * 1e9))
            found: dict[str, Msg] = {}
            for _, ch, m in self.reader.iter_messages(topics=sorted(want), starting_at=start, ending_at=t_ns, reverse=True):
                if ch.topic not in found:
                    found[ch.topic] = (ch.topic, m.log_time, m.data.decode("utf-8"))
                    if len(found) == len(want):
                        break
            out.extend(found.values())
        out.sort(key=lambda m: m[1])
        return out

"""Index a directory of .mcap recordings by reading only each file's summary section."""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from mcap.reader import make_reader

# Topics are "bulk" (streamed per car or per frame) rather than "light" (timing, events, results).
BULK_PREFIXES = ("/car/", "/vehicle/", "/scene/")


@dataclass
class TopicEntry:
    name: str
    channel_id: int
    schema_name: str
    schema: str
    encoding: str
    count: int
    # Earliest chunk start and latest chunk end holding this channel (ns). Bounds snapshot scans.
    first_ns: int
    last_ns: int

    @property
    def bulk(self) -> bool:
        return self.name.startswith(BULK_PREFIXES)

    def public(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "schema_name": self.schema_name,
            "schema": self.schema,
            "encoding": self.encoding,
            "count": self.count,
        }


@dataclass
class SessionEntry:
    id: str
    path: Path
    rel: str
    bytes: int
    mtime: float
    start_ns: int
    end_ns: int
    message_count: int
    metadata: dict[str, dict[str, str]]
    topics: dict[str, TopicEntry] = field(default_factory=dict)

    @property
    def info(self) -> dict[str, str]:
        return self.metadata.get("session", {})

    @property
    def duration(self) -> float:
        return (self.end_ns - self.start_ns) / 1e9

    def rel_seconds(self, ns: int) -> float:
        return (ns - self.start_ns) / 1e9

    def abs_ns(self, seconds: float) -> int:
        return self.start_ns + round(seconds * 1e9)

    def listing(self) -> dict[str, Any]:
        """Short form for GET /api/sessions."""
        info = self.info
        season = _int(info.get("season")) or _int(self.rel.split("/")[0])
        folder = self.rel.split("/")[-2] if "/" in self.rel else ""
        rnd = _int(info.get("round")) or _int(folder.split("_")[0])
        return {
            "id": self.id,
            "series": info.get("series") or ("F1" if "openf1" in info.get("source", "").lower() else "F1"),
            "season": season,
            "round": rnd,
            "event": info.get("event_name") or folder.split("_", 1)[-1].replace("-", " ").title(),
            "country": info.get("country"),
            "location": info.get("location"),
            "circuit": info.get("circuit_short_name"),
            "session": info.get("session_name") or Path(self.rel).stem.replace("_", " ").title(),
            "session_type": info.get("session_type"),
            "slug": Path(self.rel).stem,
            "scheduled_start_ns": _int(info.get("date_start_ns")),
            "scheduled_end_ns": _int(info.get("date_end_ns")),
            "gmt_offset": info.get("gmt_offset"),
            "start_ns": self.start_ns,
            "start_ns_str": str(self.start_ns),
            "end_ns": self.end_ns,
            "duration": self.duration,
            "bytes": self.bytes,
            "message_count": self.message_count,
            "topics": sorted(self.topics),
            "live": False,
        }

    def details(self) -> dict[str, Any]:
        out = self.listing()
        out["topics"] = [t.public() for t in sorted(self.topics.values(), key=lambda t: t.name)]
        out["metadata"] = self.metadata
        out["name"] = Path(self.rel).name
        return out


def _int(v: Any) -> int | None:
    try:
        return int(str(v))
    except (TypeError, ValueError):
        return None


def session_id(rel: str) -> str:
    """2026/17_singapore/race.mcap -> 2026-17_singapore-race"""
    return rel.removesuffix(".mcap").replace("/", "-").replace(" ", "_")


def read_entry(path: Path, root: Path) -> SessionEntry:
    rel = path.relative_to(root).as_posix()
    st = path.stat()
    with path.open("rb") as f:
        reader = make_reader(f)
        summary = reader.get_summary()
        if summary is None or summary.statistics is None:
            raise ValueError(f"{rel}: no summary section")
        stats = summary.statistics
        metadata: dict[str, dict[str, str]] = {}
        for md in reader.iter_metadata():
            metadata[md.name] = dict(md.metadata)
    bounds: dict[int, list[int]] = {}
    for ci in summary.chunk_indexes:
        for cid in ci.message_index_offsets:
            b = bounds.setdefault(cid, [ci.message_start_time, ci.message_end_time])
            b[0] = min(b[0], ci.message_start_time)
            b[1] = max(b[1], ci.message_end_time)
    topics: dict[str, TopicEntry] = {}
    for cid, ch in summary.channels.items():
        sc = summary.schemas.get(ch.schema_id)
        lo, hi = bounds.get(cid, [stats.message_start_time, stats.message_end_time])
        topics[ch.topic] = TopicEntry(
            name=ch.topic,
            channel_id=cid,
            schema_name=sc.name if sc else "",
            schema=sc.data.decode("utf-8", "replace") if sc else "{}",
            encoding=ch.message_encoding,
            count=stats.channel_message_counts.get(cid, 0),
            first_ns=lo,
            last_ns=hi,
        )
    return SessionEntry(
        id=session_id(rel),
        path=path,
        rel=rel,
        bytes=st.st_size,
        mtime=st.st_mtime,
        start_ns=stats.message_start_time,
        end_ns=stats.message_end_time,
        message_count=stats.message_count,
        metadata=metadata,
        topics=topics,
    )


class SessionIndex:
    """All recordings under a root directory. Rescans cheaply: unchanged files are kept."""

    def __init__(self, root: str | os.PathLike[str]):
        self.root = Path(root)
        self._entries: dict[str, SessionEntry] = {}
        self._by_path: dict[Path, SessionEntry] = {}
        self.errors: dict[str, str] = {}
        self._lock = threading.Lock()

    def scan(self) -> list[SessionEntry]:
        with self._lock:
            seen: dict[Path, SessionEntry] = {}
            errors: dict[str, str] = {}
            if self.root.is_dir():
                for path in sorted(self.root.rglob("*.mcap")):
                    try:
                        st = path.stat()
                        old = self._by_path.get(path)
                        if old and old.mtime == st.st_mtime and old.bytes == st.st_size:
                            seen[path] = old
                        else:
                            seen[path] = read_entry(path, self.root)
                    except Exception as exc:  # a half-written or foreign file must not hide the rest
                        errors[path.relative_to(self.root).as_posix()] = str(exc)
            self._by_path = seen
            self._entries = {e.id: e for e in seen.values()}
            self.errors = errors
            return self.sessions()

    def sessions(self) -> list[SessionEntry]:
        def key(e: SessionEntry):
            return (e.listing()["season"] or 0, e.listing()["round"] or 0, e.start_ns)

        return sorted(self._entries.values(), key=key)

    def get(self, sid: str) -> SessionEntry | None:
        e = self._entries.get(sid)
        if e is None:
            self.scan()
            e = self._entries.get(sid)
        return e


def dumps(obj: Any) -> str:
    return json.dumps(obj, separators=(",", ":"))

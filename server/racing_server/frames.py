"""Wire format shared by replay and live streams (server -> client, JSON text frames).

Message tuples are encoded as `[topic, t, payload]` where `t` is seconds since the session's
`start_ns` and `payload` is the message's JSON exactly as stored, so the server never parses it.
"""

from __future__ import annotations

import json
from collections.abc import Iterable

from .reader import Msg


class Encoder:
    def __init__(self, start_ns: int):
        self.start_ns = start_ns
        self._topic_json: dict[str, str] = {}

    def rel(self, ns: int) -> float:
        return (ns - self.start_ns) / 1e9

    def _topic(self, t: str) -> str:
        s = self._topic_json.get(t)
        if s is None:
            s = self._topic_json[t] = json.dumps(t)
        return s

    def msgs(self, msgs: Iterable[Msg]) -> str:
        start = self.start_ns
        return ",".join(f"[{self._topic(t)},{(ns - start) / 1e9:.6f},{data}]" for t, ns, data in msgs)

    def frame(self, type_: str, msgs: Iterable[Msg] | None = None, **fields) -> str:
        head = json.dumps({"type": type_, **fields}, separators=(",", ":"))
        if msgs is None:
            return head
        return f'{head[:-1]},"msgs":[{self.msgs(msgs)}]}}'

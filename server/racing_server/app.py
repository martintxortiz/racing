"""FastAPI app: session index, raw file access with HTTP ranges, replay and live streams."""

from __future__ import annotations

import asyncio
import json
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from .index import SessionIndex
from .live import IngestSource, LiveRegistry, LiveStream, SimulatedLiveSource
from .reader import LightCache
from .stream import ReplayStream

DEFAULT_DATA_DIR = "/workspace/f1data-out"


class Settings:
    def __init__(self, data_dir: str | None = None, cache_dir: str | None = None, simulate: str | None = None):
        self.data_dir = data_dir or os.environ.get("RACING_DATA_DIR", DEFAULT_DATA_DIR)
        default_cache = str(Path(__file__).resolve().parent.parent / ".cache")
        self.cache_dir = cache_dir if cache_dir is not None else os.environ.get("RACING_CACHE_DIR", default_cache)
        # "<session id>[@from_seconds][x<speed>]" starts a simulated live session on boot.
        self.simulate = simulate if simulate is not None else os.environ.get("RACING_SIMULATE_LIVE", "")
        origins = os.environ.get("RACING_CORS_ORIGINS", "*")
        self.cors = [o.strip() for o in origins.split(",") if o.strip()]


def parse_simulate(spec: str) -> tuple[str, float | None, float]:
    m = re.fullmatch(r"([^@x]+?)(?:@([\d.]+))?(?:x([\d.]+))?", spec.strip())
    if not m:
        raise ValueError(f"bad RACING_SIMULATE_LIVE spec {spec!r}")
    return m.group(1), float(m.group(2)) if m.group(2) else None, float(m.group(3)) if m.group(3) else 1.0


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings()
    index = SessionIndex(cfg.data_dir)
    cache = LightCache(cfg.cache_dir or None)
    live = LiveRegistry()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await asyncio.to_thread(index.scan)
        for spec in filter(None, (s.strip() for s in cfg.simulate.split(","))):
            sid, from_s, speed = parse_simulate(spec)
            entry = index.get(sid)
            if entry:
                live.add(SimulatedLiveSource(entry, cache, from_s, speed))
        yield
        await live.close()

    app = FastAPI(title="Racing Workbench session server", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=cfg.cors, allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"])
    app.state.index = index
    app.state.cache = cache
    app.state.live = live

    def entry_or_404(sid: str):
        e = index.get(sid)
        if e is None:
            raise HTTPException(404, f"no session {sid!r}")
        return e

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "data_dir": cfg.data_dir, "sessions": len(index.sessions()), "live": len(live.sessions), "errors": index.errors}

    @app.get("/api/sessions")
    async def sessions(rescan: bool = False) -> list[dict[str, Any]]:
        if rescan:
            await asyncio.to_thread(index.scan)
        out = [e.listing() for e in index.sessions()]
        out.extend(h.listing() for h in live.sessions.values())
        return out

    @app.get("/api/sessions/{sid}")
    def session(sid: str) -> dict[str, Any]:
        hub = live.get(sid)
        if hub:
            return hub.details()
        return entry_or_404(sid).details()

    @app.api_route("/api/sessions/{sid}/file", methods=["GET", "HEAD"])
    def file(sid: str, request: Request):
        e = entry_or_404(sid)
        size = e.path.stat().st_size
        headers = {"Accept-Ranges": "bytes", "Content-Type": "application/octet-stream", "Content-Disposition": f'inline; filename="{e.id}.mcap"'}
        rng = request.headers.get("range")
        start, end, status = 0, size - 1, 200
        if rng:
            m = re.fullmatch(r"bytes=(\d*)-(\d*)", rng.strip())
            if not m or (not m.group(1) and not m.group(2)):
                raise HTTPException(416, "bad range", headers={"Content-Range": f"bytes */{size}"})
            if m.group(1):
                start = int(m.group(1))
                end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
            else:  # suffix range: last N bytes
                start, end = max(0, size - int(m.group(2))), size - 1
            if start >= size or start > end:
                raise HTTPException(416, "range not satisfiable", headers={"Content-Range": f"bytes */{size}"})
            status = 206
            headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        length = end - start + 1
        headers["Content-Length"] = str(length)
        if request.method == "HEAD":
            return Response(status_code=status, headers=headers)

        def body():
            with e.path.open("rb") as f:
                f.seek(start)
                left = length
                while left > 0:
                    chunk = f.read(min(1 << 20, left))
                    if not chunk:
                        break
                    left -= len(chunk)
                    yield chunk

        return StreamingResponse(body(), status_code=status, headers=headers)

    @app.websocket("/api/sessions/{sid}/stream")
    async def stream(ws: WebSocket, sid: str, live_: bool = Query(False, alias="live"), from_: float | None = Query(None, alias="from"), speed: float = 1.0):
        await ws.accept()
        hub = live.get(sid)
        if hub is None and live_:
            entry = index.get(sid)
            if entry is not None:
                hub = live.get(f"live-{sid}") or live.add(SimulatedLiveSource(entry, cache, from_, speed))
        if hub is not None:
            await LiveStream(ws, hub).run()
            return
        entry = index.get(sid)
        if entry is None:
            await ws.send_text(json.dumps({"type": "error", "message": f"no session {sid!r}"}))
            await ws.close(code=4404)
            return
        await ReplayStream(ws, entry, cache).run()

    @app.get("/api/live")
    def live_list() -> list[dict[str, Any]]:
        return [h.listing() for h in live.sessions.values()]

    @app.post("/api/live/simulate")
    async def live_simulate(body: dict[str, Any]) -> dict[str, Any]:
        sid = body.get("session")
        entry = entry_or_404(str(sid))
        lid = body.get("id") or f"live-{entry.id}"
        if live.get(lid):
            await live.remove(lid)
        hub = live.add(SimulatedLiveSource(entry, cache, body.get("from"), float(body.get("speed", 1)), sid=lid))
        return hub.listing()

    @app.delete("/api/live/{sid}")
    async def live_delete(sid: str) -> dict[str, Any]:
        if not await live.remove(sid):
            raise HTTPException(404, f"no live session {sid!r}")
        return {"ok": True}

    @app.websocket("/api/live/{sid}/ingest")
    async def ingest(ws: WebSocket, sid: str):
        """Push a live session: first a hello frame, then messages. See README."""
        await ws.accept()
        try:
            hello = await ws.receive_json()
            if hello.get("type") != "hello":
                await ws.close(code=4400)
                return
            if live.get(sid):
                await live.remove(sid)
            src = IngestSource(sid, hello)
            live.add(src)
            while True:
                frame = await ws.receive_json()
                items = frame if isinstance(frame, list) else frame.get("msgs", [frame]) if isinstance(frame, dict) else []
                for it in items:
                    ns = int(it.get("log_time_ns") or it.get("t_ns") or 0)
                    data = it.get("data", {})
                    await src.queue.put((it["topic"], ns, data if isinstance(data, str) else json.dumps(data, separators=(",", ":"))))
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # malformed frame: tell the producer, keep the session
            try:
                await ws.send_text(json.dumps({"type": "error", "message": str(exc)}))
                await ws.close(code=4400)
            except Exception:
                pass
        finally:
            src_obj = live.get(sid)
            if src_obj and isinstance(src_obj.source, IngestSource):
                await src_obj.source.queue.put(None)  # feed over; the session stays readable

    return app


app = create_app()

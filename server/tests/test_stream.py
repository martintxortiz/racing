import json
import time

URL = "/api/sessions/2026-01_testland-race/stream"
TOPICS = ["/session/info", "/stints", "/timing/laps", "/car/1/position"]


def recv(ws):
    return json.loads(ws.receive_text())


def until(ws, type_, **match):
    """Frames up to and including the first of `type_` matching `match`."""
    out = []
    while True:
        f = recv(ws)
        out.append(f)
        if f["type"] == type_ and all(f.get(k) == v for k, v in match.items()):
            return out


def msgs_of(frames, type_=None, kind=None):
    return [m for f in frames if (type_ is None or f["type"] == type_) and (kind is None or f.get("kind") == kind) for m in f.get("msgs", [])]


def open_history(ws, t):
    hello = recv(ws)
    assert hello["type"] == "hello" and hello["live"] is False and abs(hello["duration"] - 120) < 1e-9
    ws.send_json({"op": "subscribe", "topics": TOPICS, "mode": "history"})
    first = until(ws, "state")
    ws.send_json({"op": "seek", "t": t})
    return first, until(ws, "state")


def test_static_topics_sent_once_up_front(client):
    with client.websocket_connect(URL) as ws:
        first, _ = open_history(ws, 5)
        static = [f for f in first if f["type"] == "static"]
        assert len(static) == 1
        assert {m[0] for m in static[0]["msgs"]} == {"/session/info", "/stints"}
        # /stints is stamped at the end of the session but is delivered immediately.
        assert next(m for m in static[0]["msgs"] if m[0] == "/stints")[1] == 120.0


def test_seek_sends_snapshot_then_ordered_history(client):
    with client.websocket_connect(URL) as ws:
        _, frames = open_history(ws, 30)
        types = [f["type"] for f in frames]
        assert types.index("snapshot") < types.index("batch") < types.index("history_done")
        snap = next(f for f in frames if f["type"] == "snapshot")
        assert snap["t"] == 30
        latest = {m[0]: m for m in snap["msgs"]}
        assert latest["/timing/laps"][2]["lap_number"] == 3
        assert latest["/car/1/position"][2]["i"] == 120 and latest["/car/1/position"][1] == 30
        hist = msgs_of(frames, "batch", "history")
        ts = [m[1] for m in hist]
        assert ts == sorted(ts) and 0 < ts[0] and ts[-1] == 30
        pos = [m[2]["i"] for m in hist if m[0] == "/car/1/position"]
        assert pos == list(range(1, 121))  # (0, 30], no gaps, no duplicates
        # Seeking backwards sends no data: the client already has it.
        ws.send_json({"op": "seek", "t": 10})
        back = until(ws, "state")
        assert [f["type"] for f in back] == ["state"] and back[0]["t"] == 10


def test_stream_is_ordered_paced_and_batched(client):
    with client.websocket_connect(URL) as ws:
        open_history(ws, 30)
        ws.send_json({"op": "seek", "t": 30})
        until(ws, "state")
        ws.send_json({"op": "speed", "x": 10})
        until(ws, "state")
        ws.send_json({"op": "play"})
        t0 = time.monotonic()
        batches = []
        while time.monotonic() - t0 < 1.0:
            f = recv(ws)
            if f["type"] == "batch":
                batches.append((time.monotonic() - t0, f))
        ws.send_json({"op": "pause"})
        assert 8 <= len(batches) <= 30, len(batches)  # ~50 ms batches
        msgs = [m for _, f in batches for m in f["msgs"]]
        ts = [m[1] for m in msgs]
        assert ts == sorted(ts) and ts[0] > 30
        pos = [m[2]["i"] for m in msgs if m[0] == "/car/1/position"]
        assert pos == list(range(121, 121 + len(pos)))  # continues exactly after the seek point
        # Paced: 1 s of wall time at 10x covers ~10 s, plus the small lead (~3 s at 10x).
        assert 36 < ts[-1] < 46, ts[-1]
        first_wall, first = batches[0]
        assert first["msgs"][-1][1] <= 30 + 10 * first_wall + 3.5
        for wall, f in batches:
            assert f["msgs"][-1][1] <= 30 + 10 * (wall + 0.05) + 3.5


def test_snapshot_mode_resends_state_on_every_seek(client):
    with client.websocket_connect(URL) as ws:
        recv(ws)
        ws.send_json({"op": "subscribe", "topics": ["/timing/laps", "/car/44/position"], "mode": "snapshot"})
        frames = until(ws, "state")
        assert not msgs_of(frames, "batch", "history")
        for t, lap in ((60, 6), (25, 2)):
            ws.send_json({"op": "seek", "t": t})
            frames = until(ws, "state")
            snap = next(f for f in frames if f["type"] == "snapshot")
            latest = {m[0]: m for m in snap["msgs"]}
            assert latest["/timing/laps"][2]["lap_number"] == lap
            assert latest["/car/44/position"][1] == t
        ws.send_json({"op": "speed", "x": 40})
        ws.send_json({"op": "play"})
        f = until(ws, "batch")[-1]
        assert f["kind"] == "stream" and f["msgs"][0][1] > 25


def test_subscribe_more_topics_backfills_them(client):
    with client.websocket_connect(URL) as ws:
        open_history(ws, 20)
        ws.send_json({"op": "subscribe", "topics": ["/car/44/position"]})
        frames = until(ws, "state")
        hist = msgs_of(frames, "batch", "history")
        assert {m[0] for m in hist} == {"/car/44/position"} and hist[-1][1] == 20 and len(hist) == 81


def test_plays_to_the_end(client):
    with client.websocket_connect(URL) as ws:
        open_history(ws, 110)
        ws.send_json({"op": "speed", "x": 200})
        ws.send_json({"op": "play"})
        frames = until(ws, "end")
        assert msgs_of(frames, "batch", "stream")[-1][1] == 120
        assert until(ws, "state")[-1]["playing"] is False


def test_unknown_session(client):
    with client.websocket_connect("/api/sessions/nope/stream") as ws:
        assert recv(ws)["type"] == "error"


def test_full_subscription_sends_whole_topic_then_leaves_stream(client):
    with client.websocket_connect(URL) as ws:
        recv(ws)
        ws.send_json({"op": "seek", "t": 20})
        until(ws, "state")
        ws.send_json({"op": "subscribe", "topics": ["/timing/laps"], "full": True, "id": 7})
        frames = until(ws, "state", ack=7)
        laps = msgs_of(frames, "batch", "history")
        # Every lap of the session, not just those before the clock.
        assert [m[2]["lap_number"] for m in laps if m[2]["driver_number"] == 1] == list(range(1, 12))
        done = next(f for f in frames if f["type"] == "history_done")
        assert done["topics"] == ["/timing/laps"] and done["t"] == 120
        ws.send_json({"op": "subscribe", "topics": ["/car/1/position"]})
        until(ws, "state")
        ws.send_json({"op": "speed", "x": 20})
        ws.send_json({"op": "play"})
        t0 = time.monotonic()
        streamed = []
        while time.monotonic() - t0 < 0.6:
            f = recv(ws)
            streamed += msgs_of([f], "batch", "stream")
        assert streamed and {m[0] for m in streamed} == {"/car/1/position"}

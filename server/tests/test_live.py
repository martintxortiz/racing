import json
import time

LIVE = "/api/sessions/2026-01_testland-race/stream?live=true&from=20&speed=10"


def recv(ws):
    return json.loads(ws.receive_text())


def test_simulated_live_history_then_messages_as_they_arrive(client):
    with client.websocket_connect(LIVE) as ws:
        hello = recv(ws)
        assert hello["type"] == "hello" and hello["live"] is True
        ws.send_json({"op": "subscribe", "topics": ["/car/1/position", "/timing/laps"]})
        hist, live, heads = [], [], []
        done = False
        t0 = time.monotonic()
        while time.monotonic() - t0 < 1.5:
            f = recv(ws)
            if f["type"] == "batch" and f["kind"] == "history":
                hist += f["msgs"]
            elif f["type"] == "history_done":
                done = True
            elif f["type"] == "batch" and f["kind"] == "live":
                assert done
                live += f["msgs"]
            elif f["type"] == "state":
                assert f["live"] is True
                heads.append(f["head"])
        assert hist and hist[-1][1] >= 20
        assert live, "no live messages"
        allpos = [m[2]["i"] for m in hist + live if m[0] == "/car/1/position"]
        assert allpos == list(range(allpos[0], allpos[0] + len(allpos)))  # no gap at the join
        assert heads == sorted(heads) and heads[-1] > 25
    listing = client.get("/api/sessions").json()
    item = next(s for s in listing if s["id"] == "live-2026-01_testland-race")
    assert item["live"] is True


def test_ingest_source(client):
    with client.websocket_connect("/api/live/mylive/ingest") as prod:
        prod.send_json({"type": "hello", "title": "Test feed", "start_ns": 1000, "topics": {"/timing/laps": {"schema": {"type": "object"}}}})
        prod.send_json({"topic": "/timing/laps", "log_time_ns": 1000 + 10**9, "data": {"lap_number": 1}})
        time.sleep(0.2)
        with client.websocket_connect("/api/sessions/mylive/stream") as ws:
            assert recv(ws)["live"] is True
            ws.send_json({"op": "subscribe", "topics": ["/timing/laps"]})
            got = []
            while not got or got[-1][2]["lap_number"] < 2:
                f = recv(ws)
                if f["type"] == "history_done":
                    prod.send_json({"msgs": [{"topic": "/timing/laps", "log_time_ns": 1000 + 2 * 10**9, "data": {"lap_number": 2}}]})
                got += f.get("msgs", []) if f["type"] == "batch" else []
            assert [m[1] for m in got] == [1.0, 2.0]
    d = client.get("/api/sessions/mylive").json()
    assert d["live"] and d["topics"][0]["name"] == "/timing/laps"


def test_simulated_live_sends_reference_topics_up_front_but_not_outcomes(client):
    with client.websocket_connect(LIVE) as ws:
        recv(ws)
        ws.send_json({"op": "subscribe", "topics": ["/session/info", "/stints", "/timing/laps"], "id": 1})
        frames = []
        while not (frames and frames[-1]["type"] == "state" and frames[-1].get("ack") == 1):
            frames.append(recv(ws))
        static = [m for f in frames if f["type"] == "static" for m in f["msgs"]]
        assert [m[0] for m in static] == ["/session/info"]
        hist = [m for f in frames if f["type"] in ("batch", "snapshot") for m in f["msgs"]]
        # Stints are stamped at the end of the session: a live client cannot have them yet.
        assert not any(m[0] == "/stints" for m in hist)
        assert {m[0] for m in hist} == {"/timing/laps"}

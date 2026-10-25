from racing_server.index import SessionIndex, session_id

from .conftest import DURATION, START


def test_scan_lists_sessions_with_metadata(data_dir):
    idx = SessionIndex(data_dir)
    sessions = idx.scan()
    assert [s.id for s in sessions] == ["2026-01_testland-race", "2026-01_testland-qualifying", "2026-02_otherland-race"] or {s.id for s in sessions} == {
        "2026-01_testland-race",
        "2026-01_testland-qualifying",
        "2026-02_otherland-race",
    }
    race = idx.get("2026-01_testland-race")
    assert race is not None
    assert race.start_ns == START and race.end_ns == START + DURATION * 1_000_000_000
    item = race.listing()
    assert item["season"] == 2026 and item["round"] == 1
    assert item["event"] == "Test Grand Prix" and item["session"] == "Race"
    assert "/car/44/position" in item["topics"] and item["bytes"] > 0
    assert race.topics["/timing/laps"].count == 22
    assert not race.topics["/timing/laps"].bulk and race.topics["/car/1/position"].bulk
    # The broken file is reported, not fatal.
    assert any("broken" in k for k in idx.errors)


def test_rescan_keeps_unchanged_entries(data_dir):
    idx = SessionIndex(data_dir)
    idx.scan()
    a = idx.get("2026-01_testland-race")
    idx.scan()
    assert idx.get("2026-01_testland-race") is a


def test_session_id():
    assert session_id("2026/17_singapore/race.mcap") == "2026-17_singapore-race"


def test_api_sessions(client):
    r = client.get("/api/sessions")
    assert r.status_code == 200
    ids = {s["id"] for s in r.json()}
    assert "2026-01_testland-race" in ids
    d = client.get("/api/sessions/2026-01_testland-race").json()
    laps = next(t for t in d["topics"] if t["name"] == "/timing/laps")
    assert laps["count"] == 22 and "lap_duration" in laps["schema"]
    assert d["metadata"]["session"]["event_name"] == "Test Grand Prix"
    assert client.get("/api/sessions/nope").status_code == 404

def test_full_file(client, data_dir):
    raw = (data_dir / "2026/01_testland/race.mcap").read_bytes()
    r = client.get("/api/sessions/2026-01_testland-race/file")
    assert r.status_code == 200
    assert r.headers["accept-ranges"] == "bytes"
    assert r.content == raw


def test_range_requests(client, data_dir):
    raw = (data_dir / "2026/01_testland/race.mcap").read_bytes()
    url = "/api/sessions/2026-01_testland-race/file"
    r = client.get(url, headers={"Range": "bytes=0-7"})
    assert r.status_code == 206 and r.content == raw[:8] == b"\x89MCAP0\r\n"
    assert r.headers["content-range"] == f"bytes 0-7/{len(raw)}"
    r = client.get(url, headers={"Range": "bytes=100-"})
    assert r.status_code == 206 and r.content == raw[100:]
    r = client.get(url, headers={"Range": "bytes=-30"})
    assert r.status_code == 206 and r.content == raw[-30:]
    r = client.get(url, headers={"Range": f"bytes={len(raw)}-"})
    assert r.status_code == 416
    h = client.head(url)
    assert h.status_code == 200 and int(h.headers["content-length"]) == len(raw)

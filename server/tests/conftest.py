"""Small synthetic recordings shaped like the f1pipe output (see MCAP_FORMAT.md)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from mcap.writer import CompressionType, Writer

from racing_server.app import Settings, create_app

START = 1_700_000_000_000_000_000  # ns
SEC = 1_000_000_000
DURATION = 120  # seconds


def obj_schema(**props):
    return json.dumps({"type": "object", "properties": {k: {"type": v} for k, v in props.items()}}).encode()


def write_session(path: Path, *, session_name="Race", season="2026", rnd="1", event="Test Grand Prix", cars=("1", "44")):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        w = Writer(f, chunk_size=4096, compression=CompressionType.ZSTD)
        w.start(profile="", library="test")
        ids = {}

        def chan(topic, schema):
            sid = w.register_schema(name=topic.strip("/").replace("/", "."), encoding="jsonschema", data=schema)
            ids[topic] = w.register_channel(topic=topic, message_encoding="json", schema_id=sid)

        chan("/session/info", obj_schema(session_name="string"))
        chan("/drivers", json.dumps({"type": "object", "properties": {"rows": {"type": "array", "items": {"type": "object", "properties": {"driver_number": {"type": "integer"}}}}}}).encode())
        chan("/timing/laps", obj_schema(driver_number="integer", lap_number="integer", lap_duration="number"))
        chan("/stints", obj_schema(rows="array"))
        for c in cars:
            chan(f"/car/{c}/position", obj_schema(x="number", y="number"))

        msgs = []
        msgs.append((START, "/session/info", {"session_name": session_name}))
        msgs.append((START, "/drivers", {"rows": [{"driver_number": int(c)} for c in cars]}))
        for i in range(DURATION * 4 + 1):  # 4 Hz positions
            for c in cars:
                msgs.append((START + i * SEC // 4, f"/car/{c}/position", {"x": i, "y": int(c), "i": i}))
        for lap in range(1, 12):  # a lap every 10 s
            for c in cars:
                msgs.append((START + lap * 10 * SEC, "/timing/laps", {"driver_number": int(c), "lap_number": lap, "lap_duration": 10.0}))
        msgs.append((START + DURATION * SEC, "/stints", {"rows": [{"driver_number": 1, "compound": "SOFT"}]}))
        msgs.sort(key=lambda m: m[0])
        for seq, (ns, topic, data) in enumerate(msgs):
            w.add_message(channel_id=ids[topic], log_time=ns, publish_time=ns, data=json.dumps(data).encode(), sequence=seq)
        w.add_metadata("session", {"season": season, "round": rnd, "event_name": event, "session_name": session_name, "session_type": session_name, "country": "Testland", "date_start_ns": str(START + 10 * SEC), "date_end_ns": str(START + DURATION * SEC), "gmt_offset": "01:00:00"})
        w.finish()
    return path


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    root = tmp_path / "data"
    write_session(root / "2026" / "01_testland" / "race.mcap")
    write_session(root / "2026" / "01_testland" / "qualifying.mcap", session_name="Qualifying")
    write_session(root / "2026" / "02_otherland" / "race.mcap", rnd="2", event="Other Grand Prix")
    (root / "2026" / "02_otherland" / "broken.mcap").write_bytes(b"not an mcap")
    return root


@pytest.fixture()
def app(data_dir: Path, tmp_path: Path):
    return create_app(Settings(data_dir=str(data_dir), cache_dir=str(tmp_path / "cache"), simulate=""))


@pytest.fixture()
def client(app):
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c

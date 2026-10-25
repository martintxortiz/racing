# Session server

A small Python service that indexes a folder of `.mcap` recordings and streams
them to the Racing Workbench over a WebSocket, as a replay or as a live feed.
It never parses message payloads: it reads them through the MCAP chunk index
and forwards the JSON as is, so it works for any series that follows the
[data format](../README.md#data-format).

## Run

Python 3.11 or later.

```sh
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m racing_server          # http://127.0.0.1:8000
.venv/bin/python -m pytest                  # tests
```

From the repository root, `npm run server:setup`, `npm run server`,
`npm run test:server` and `npm run dev:all` (server and app together) do the same.

| Variable               | Default                  | Meaning |
| ---------------------- | ------------------------ | ------- |
| `RACING_DATA_DIR`      | `/workspace/f1data-out`  | Folder scanned for `**/*.mcap` (for example `2026/17_singapore/race.mcap`) |
| `RACING_CACHE_DIR`     | `server/.cache`          | Disk cache of each session's small topics; empty disables it |
| `RACING_HOST`          | `127.0.0.1`              | Bind address |
| `RACING_PORT`          | `8000`                   | Port |
| `RACING_CORS_ORIGINS`  | `*`                      | Comma-separated allowed origins |
| `RACING_SIMULATE_LIVE` | (none)                   | Start simulated live sessions on boot: `<id>[@<from s>][x<speed>]`, comma-separated |
| `RACING_RELOAD`        | (off)                    | `1` reloads on code changes |

The server has no authentication. The simulate and ingest endpoints can start
feeds, so keep it on localhost or behind a proxy that you control.

## Endpoints

| Method | Path | |
| ------ | ---- | - |
| GET  | `/api/health` | Data folder, session count, index errors |
| GET  | `/api/sessions[?rescan=1]` | All sessions (live ones first): id, event, round, session, scheduled start, duration, size, topics |
| GET  | `/api/sessions/{id}` | One session with topic schemas, counts and the file metadata |
| GET/HEAD | `/api/sessions/{id}/file` | The `.mcap` file, with `Range` support (the app's **File** action and `?src=`) |
| WS   | `/api/sessions/{id}/stream` | Replay stream; `?live=true[&from=s][&speed=x]` streams it as a simulated live session instead |
| GET  | `/api/live` | Running live sessions |
| POST | `/api/live/simulate` | `{"session": id, "from": s?, "speed": x?, "id": name?}` starts a simulated live session |
| DELETE | `/api/live/{id}` | Stops a live session |
| WS   | `/api/live/{id}/ingest` | Push a live feed from another process (below) |

Session ids come from the path: `2026/17_singapore/race.mcap` is
`2026-17_singapore-race`. Live sessions are `live-<id>` (simulated) or the name
given to the ingest socket, and stream from `/api/sessions/{live id}/stream`.

## Stream protocol

Every frame is a JSON object with a `type`. Messages travel as
`[topic, seconds since the session start, payload]`; the session start is the
`start_ns` of `hello` (a decimal string, nanoseconds since the epoch).

Client to server (`id` is optional; the `state` frame that ends a command's
handling echoes it as `ack`):

| Command | |
| ------- | - |
| `{"op": "subscribe", "topics": [...], "mode": "history", "since": s?, "full": bool?}` | Start receiving topics. `history` (default) sends a snapshot, then everything from `since` (default: the start) up to the clock, then `history_done`. `snapshot` sends only the latest message per topic. `full: true` sends the whole topic once and leaves it out of the stream |
| `{"op": "unsubscribe", "topics": [...]}` | |
| `{"op": "play"}`, `{"op": "pause"}` | Replay only |
| `{"op": "seek", "t": s}` | Replay only. Forward past what was sent: snapshot, history, `history_done`. Backwards: nothing (the client has it) |
| `{"op": "speed", "x": 4}` | Replay only |

Server to client:

| Frame | |
| ----- | - |
| `hello` | `session`, `start_ns`, `duration`, `live`, `topics` |
| `static` | One-message topics (driver list, track outline, stints...), sent once when subscribed |
| `snapshot` | `t`, `topics`, `msgs`: the latest message per topic at `t` |
| `batch` | `kind` `history`, `stream` (paced replay) or `live`; `msgs` in log-time order; `clock` |
| `history_done` | `t`, `topics`: history for those topics is complete up to `t` |
| `state` | `t`, `playing`, `speed`, `live`, `head` (live), `ack` |
| `end` | The replay reached the end |
| `error` | `message` |

How it performs:

- Small topics (timing, race control, weather, pit, radio...) are read once
  per session into memory and cached on disk; per-car topics (`/car/*`,
  `/vehicle/*`, `/scene/*`) are read from the file on demand through the MCAP
  chunk index, so a seek touches only the chunks it needs and no client holds a
  whole file in memory.
- While playing, the server sends due messages about every 50 ms, up to
  1 s x sqrt(speed) ahead of the clock. Sends are awaited, so a slow client
  slows its own producer (backpressure); batches are capped at 5000 messages
  and never split a timestamp.
- A live subscriber that falls more than 64 MB behind gets an `error` and is
  closed with code 1013, so it can reconnect and resync.

## Live sources

A live session is a `LiveSource` (`racing_server/live.py`) behind a
`LiveSession` hub that fans its messages out to every connected client:

```python
class LiveSource(ABC):
    id: str; title: str; start_ns: int
    metadata: dict[str, dict[str, str]]
    topics: dict[str, TopicDecl]          # name -> schema
    reference: frozenset[str]             # topics a new client gets in full at once

    async def run(self, sink: Sink) -> None:
        # sink.publish(topic, log_time_ns, payload_dict) for each message,
        # sink.advance(ns) when time moves on without messages
        ...

    def open_history(self) -> History | None:
        return None   # None: the hub keeps what was published in memory (up to 512 MB)
```

Included:

- `SimulatedLiveSource` plays a recording at wall-clock pace (times `speed`)
  from `from` (default: 2 minutes before the scheduled start), keeping the
  original timestamps. Reference topics (drivers, track, session info) are
  available at once; stints and results arrive when the file has them.
- `IngestSource` takes messages pushed to `WS /api/live/{id}/ingest`. Send a
  hello, then messages, one at a time or in lists:

  ```json
  {"type": "hello", "title": "My feed", "start_ns": 1791720000000000000,
   "metadata": {"session": {"event_name": "...", "session_name": "Race"}},
   "topics": {"/timing/laps": {"schema_name": "f1.laps", "schema": {...}}}}
  {"topic": "/timing/laps", "log_time_ns": 1791720061000000000, "data": {...}}
  {"msgs": [{"topic": "...", "log_time_ns": ..., "data": {...}}, ...]}
  ```

### Adding a real feed

Either write a `LiveSource` subclass and register it in `app.py` (as
`/api/live/simulate` does for the simulated one), or run the adapter as a
separate process that pushes to the ingest socket; the second needs no server
changes. In both cases the adapter's job is to emit the topics of the data
format with JSON schemas.

- **OpenF1** (`api.openf1.org/v1`): during a session, poll `laps`,
  `intervals`, `position`, `race_control`, `pit`, `stints`, `weather` and
  `team_radio` with `date>` the last seen time, and `location` and `car_data`
  per driver; map each row to the same topics the recorder in this folder's
  recordings uses (`/timing/laps`, `/timing/intervals`, `/car/{n}/position`,
  `/car/{n}/telemetry`...). Send `/drivers`, `/session/info` and the track
  topics first; they are the reference data. Live OpenF1 data needs a
  subscription; mind its rate limits.
- **UDP telemetry from games** (F1 25, Le Mans Ultimate, Assetto Corsa):
  listen on the game's UDP port with `asyncio.DatagramProtocol`, decode the
  packets (the F1 25 spec is published by EA; LMU and AC expose shared memory or
  UDP through plugins), and publish `/car/{idx}/telemetry` (speed, throttle,
  brake, gear, rpm), `/car/{idx}/position` (world x, y) and `/timing/laps` on
  lap completion. Use the receive time for `log_time_ns` and a `start_ns`
  taken when the session starts.

## Layout

```
racing_server/
  index.py    scans RACING_DATA_DIR, reads summaries and metadata
  reader.py   light-topic cache, indexed reads, snapshots
  stream.py   replay stream (pacing, seek, backpressure)
  live.py     live sources, hub, live stream
  frames.py   wire encoding
  app.py      FastAPI routes
tests/        pytest (synthetic recordings written by conftest.py)
```

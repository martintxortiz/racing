# Racing Workbench

A browser workbench for racing telemetry and timing. Open an `.mcap` recording
(Foxglove-style topics) and replay the session in tabs of panels: timing, track
map, lap comparison with delta, lap times, race gaps, sectors and ideal lap, lap
history, stints and an event log. It is not tied to one series. Every widget
reads its data from the topics and fields in the file.

Files you open run entirely in the browser: they are decoded in a web worker,
and the app loads only the topics that the open panels use. Optionally, the
session server in [`server/`](server/README.md) (Python) indexes a folder of
recordings and streams them to the app over a WebSocket, as a replay or as a
live feed.

## Run it

Requires Node 20.9 or later.

```sh
npm install
npm run dev        # http://localhost:3313
```

With the session server (Python 3.11+):

```sh
npm run server:setup   # once: creates server/.venv and installs the requirements
npm run dev:all        # session server on :8000 and the app on :3313
```

`RACING_DATA_DIR` picks the folder of recordings (see
[server/README.md](server/README.md)). The app finds the server at
`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`.

Other scripts:

| Script              | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm run build`     | Production build                                  |
| `npm start`         | Serve the production build on port 3313           |
| `npm run typecheck` | `tsc --noEmit`                                    |
| `npm run lint`      | ESLint                                            |
| `npm test`          | Vitest unit tests (derivation, layout model, menus) |
| `npm run smoke`     | Headless browser smoke test against a running app (`BASE_URL`, `SMOKE_SRC`, `THEME`) |
| `npm run server`    | The session server alone (port 8000)              |
| `npm run test:server` | Server tests (pytest)                           |
| `npm run smoke:server` | Starts the session server on :8799 and checks replay, playback, the session picker and live in a running app (`BASE_URL`) |

## Open a file

- With no `?src=`, the app opens the sample session straight into the Monitor
  tab. To use another sample, set `NEXT_PUBLIC_SAMPLE_MCAP_URL` at build time.
- Click **Open .mcap**, or drop a file anywhere on the window.
- Add `?src=<url>` to load any `.mcap` URL that allows cross-origin requests.
- **Sessions** in the top bar lists the session server's recordings, grouped by
  event. **Replay** streams one, **Live** plays it as a simulated live feed,
  **File** downloads the whole file into the browser as before.
- `?api=<session id>` streams a session from the server; add `&live=1` for live
  (`&speed=`, `&from=` set the simulation pace and start) and `&apiBase=` to
  point at another server.

In live mode the transport shows **LIVE** while the cursor follows the newest
data. Scrubbing or stepping back stops following; click **LIVE** (or play to the
end) to follow again.

Other URL parameters:

- `?layout=`: a saved layout id or name, or `preset:qualifying`, `preset:race`
  or `preset:practice`.
- `?tab=`: the open tab.
- `?t=`: the replay time.
- `?lap=`: start the replay 30 s into the given lap of the leading car.

## Using the workspace

- **Tabs:** add with `+` or the `t` key. Double-click a tab to rename it, drag
  it to reorder, and right-click it for more options.
- **Panels:** split, resize, swap (drag a header), maximise, change widget or
  close a panel from its header menu or by right-clicking it.
- **Monitor:** every preset opens on a Monitor tab modelled on a pit wall:
  track and weather, race control messages, track map, lap time distribution,
  ranking tower, circle map, tyre strategy, pit window (races), team radio,
  race trace or lap times, pit stops and a speed trace.
- **Responsive panels:** text and rows keep their design size. A narrow
  panel drops its least useful columns or labels and says how many are
  hidden; a wide one shows more.
- **Track map rotation:** by default the map turns to whichever angle fills
  the panel best, and re-fits on resize. Right-click the map, then
  **Rotation**, to fix it at 0, 90, 180 or 270 degrees or a typed angle. The
  N arrow shows the file's +y axis.
- **Layouts:** the Qualifying, Race and Practice / Endurance presets are
  ordinary layouts of the same widgets. Save your own layout from the layout
  menu. Tabs and layouts are kept in localStorage.
- **Comparisons:** there is no fixed A-vs-B bar. Right-click a driver anywhere
  to set it as A or B, or to compare a lap. When you have not chosen, the top
  two cars are compared.

## Data format

The topics and fields that the app reads are described in
[f1data/docs/DATA_FORMAT.md](https://github.com/martintxortiz/f1data/blob/main/docs/DATA_FORMAT.md).

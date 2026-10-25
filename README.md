# Racing Workbench

A browser workbench for racing telemetry and timing. Open an `.mcap` recording
(Foxglove-style topics) and replay the session in tabs of panels: timing, track
map, lap comparison with delta, lap times, race gaps, sectors and ideal lap, lap
history, stints and an event log. It is not tied to one series. Every widget
reads its data from the topics and fields in the file.

Everything runs in the browser. There is no backend and no account, and you
do not need any environment variables. Files are decoded in a web worker, and
the app loads only the topics that the open panels use.

## Run it

Requires Node 20.9 or later.

```sh
npm install
npm run dev        # http://localhost:3313
```

Other scripts:

| Script              | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm run build`     | Production build                                  |
| `npm start`         | Serve the production build on port 3313           |
| `npm run typecheck` | `tsc --noEmit`                                    |
| `npm run lint`      | ESLint                                            |
| `npm test`          | Vitest unit tests (derivation, layout model, menus) |
| `npm run smoke`     | Headless browser smoke test against a running app (`BASE_URL`, `SMOKE_SRC`, `THEME`) |

## Open a file

- Click **Open .mcap**, or drop a file anywhere on the window.
- Click **Load sample** to open the sample session. To use another sample,
  set `NEXT_PUBLIC_SAMPLE_MCAP_URL` at build time.
- Add `?src=<url>` to load any `.mcap` URL that allows cross-origin requests.

Other URL parameters:

- `?layout=`: a saved layout id or name, or `preset:qualifying`, `preset:race`
  or `preset:practice`.
- `?tab=`: the open tab.
- `?t=`: the replay time.

## Using the workspace

- **Tabs:** add with `+` or the `t` key. Double-click a tab to rename it, drag
  it to reorder, and right-click it for more options.
- **Panels:** split, resize, swap (drag a header), maximise, change widget or
  close a panel from its header menu or by right-clicking it.
- **Layouts:** the Qualifying, Race and Practice / Endurance presets are
  ordinary layouts of the same widgets. Save your own layout from the layout
  menu. Tabs and layouts are kept in localStorage.
- **Comparisons:** there is no fixed A-vs-B bar. Right-click a driver anywhere
  to set it as A or B, or to compare a lap. When you have not chosen, the top
  two cars are compared.

## Data format

The topics and fields that the app reads are described in
[f1data/docs/DATA_FORMAT.md](https://github.com/martintxortiz/f1data/blob/main/docs/DATA_FORMAT.md).

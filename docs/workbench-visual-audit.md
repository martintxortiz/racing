# Workbench visual audit (v2 screenshots)

Source: `/workspace/workbench-shots/v2/*.png` (1600×960, head 09bd28f). Verdict: the v2 round pasted
Pitwall-style colour blocks onto our Carbon/Plex system. Data is there, but it is hard to read at a glance
because every cell is shouting. Defects below, grouped by cause. Each item is fixed in v3 or listed as left.

## 1. Global system problems

1. **No single table style.** Timing, Sectors, Lap distribution, Pedal, Lap history and Race control each set their
   own paddings (4/6/8/12 px), row heights (22, 24, 26, auto) and header treatments. Columns never line up
   between panels stacked in the same column.
2. **Header row is not a header.** Table headers are 28 px, 12 px, weight 500, text-2, and sit vertically centred, so
   they read as one more data row. In dark mode the header and first row run together.
3. **Saturated full-cell fills everywhere.** Team colour fills the whole driver cell (edge to edge, 100% saturation),
   purple/green fills are 24–30% mixes with bold text, the to-ideal column is a solid mustard block, the race-control
   flag and car cells are solid blocks. Five strong hues per row; the eye has no resting place.
4. **Zebra is too strong** (55% of `--pw-fill`, ~6% in light, ~4% in dark plus selection blue), and selection,
   focus, hover and compare all use similar blue mixes, so the compared rows are not distinct from zebra in dark.
5. **Comparison marker is an accent stripe** (`inset 3px` coloured bar on the position cell) — banned pattern,
   and it collides with the team block next to it.
6. **Uppercase tokens:** `PIT`, `IN`, `OUT`, `STOP` status cells, lap-history `OUT`/`IN` tags in blue bold, race
   control messages in raw uppercase, `Q1`/`Q2` labels in bold. Reads as noise.
7. **Typography drift:** 10, 11, 12, 13, 15, 16, 18, 28 px all in use; weights 400/500/600 mixed inside one row
   (session-best cells bold, team cells bold, rest regular). Numerals switch between centred and right-aligned.
8. **Panel header:** topic path (`/timing/laps`) is as prominent as the meta text and competes with the title; meta
   strings run long ("Laps within 7% of own best · out and in laps excluded") and truncate mid-word.

## 2. Timing tab (`quali-timing-*`, `race-timing-*`)

9. **Clipped columns.** The timing table's fixed column widths add up to ~760 px in a 576 px panel: `Last` is cut to
   "La", `Trap` and `Laps` are off-screen; the horizontal overflow is hidden, so the user never knows.
10. Pos and driver columns are crammed (`Pos` header wider than its data, 8 px left padding vs 4 px elsewhere).
11. Status column (`PIT`, `IN`) is 36 px of mostly empty space and is left-aligned against right-aligned numbers.
12. Tyre glyph is a 16 px red ring on every row — the column is a wall of red circles in quali (all softs).
13. Gap/Int trend fills (green/red 14–24%) on Int make the race view a checkerboard with the sector fills.
14. **Track map** floats in an over-tall panel; large dead space under the map; driver labels collide (`LEC/HAM`
    overlap at the top-right); corner numbers same weight as driver labels.
15. **Session info**: the full-width saturated green block dominates the screen; "GREEN LIGHT · PIT EXIT OPEN" in
    caps inside it; key/value rows below it are cut off at the panel bottom (`Source` half visible).
16. **Weather**: four readouts + a 60 px chart squeezed under them; the chart legend overlaps the plot top; x-axis
    labels `−56:49`… are negative offsets; y axis labels touch the panel edge.
17. **Lap times chart**: y labels `1:38.000` with three decimals; Q1/Q2/Q3 band labels collide with points;
    x-axis labels `Q1 03:19` overlap; every car drawn as hollow coloured circles + lines → rainbow scatter.
18. **Race control**: Flag and Car columns are solid colour blocks; `Break 06:31` time overflows into the flag
    cell; long uppercase messages wrap to 4–5 lines, so the panel shows only 4 messages.

## 3. Telemetry tab

19. Trace: channel titles (`Speed km/h`) are drawn inside the plot over the data; the Δ-time strip and the gear
    strip get the same visual weight as speed; corner numbers at the top are tiny and clash with the legend line.
20. Pedal use: legend squeezed into a table header; the bar column's saturated green/red/grey reads like a flag;
    numbers (`48.8 21.3 6.0 23.9`) have no unit and no visual link to the bar segments.
21. Sectors (selection) panel is 3 rows in a panel ~150 px tall, then a blank area; the yellow `+0.114` block is
    the loudest thing on the tab.
22. Lap times (selection): sparse points with long connecting lines; axis labels cramped at 250 px width.

## 4. Strategy tab

23. Gaps chart: y axis shows `+0.0 … +136.0` with no unit, 20 grey spaghetti lines with large point markers on
    the compared cars; end labels overlap (`HAM`/`LEC` stacked).
24. Timing (strategy columns) has the same clipped/crowded issues; Int trend fills dominate.
25. Stints: saturated red/yellow bars at full height, labels `S +3 · 24` inside cramped bars, the driver column
    has two dots (slot + team) — inconsistent with the team-cell treatment elsewhere; axis ticks on 12/25/37/50.
26. Weather and Race control again squeezed to ~130 px each.

## 5. Laps tab

27. Lap history: team-coloured header row is a rainbow strip; cells are 60 px fixed so only ~14 cars fit; `OUT`/
    `IN` blue caps tags everywhere; green/purple fills at 24–30% → checkerboard; lap column sticky but same tint.
28. Lap distribution: IQR boxes filled with saturated team colour + the median line; whiskers barely visible;
    axis ticks only 3, labels sit in the header without a baseline; last row clipped by the panel.
29. Sectors (field): 22 rows in a 250 px panel, half the list hidden; solid mustard to-ideal column.

## 6. Menus and chrome

30. Context menus are good structurally; but the hint column (`Auto (by session type)`) is wider than the label,
    the menu is 360 px wide, and the header row (`NOR · Lando NORRIS`) uses the surname in caps.
31. Timeline: label row (`Q1`, `Q2`, `Q3`) and tick row compete; tick labels 11 px text-3 overlap the lap marks.
32. Top bar is fine (tabs left, controls right) — keep.

## Fix plan (v3)

- One table system (`.wb-t`): 24 px rows, 28 px header with baseline-aligned 11.5→12 px text-3 labels and one
  hairline, 8 px cell padding and 12 px outer padding, Plex tabular numerals right-aligned, text left-aligned,
  2.5–3.5% zebra, no row rules.
- Semantic tints as tokens per theme (`--wb-best-*`, `--wb-pb-*`, `--wb-worse-*`, `--wb-warn-*`): ~12–16% tint with
  a darker/lighter text of the same hue (AA in both themes); same weight as the row.
- Team colour: a compact 3 px × 14 px swatch-fill... rejected → **a compact solid chip around the code** (36 × 16 px,
  2 px radius), only in the driver cell. Comparison slot shown as a small series-coloured underline-free marker:
  a 6 px square left of the chip (no stripes).
- Column priority + auto-fit: columns drop by priority when the panel is narrower than their sum.
- Status as quiet sentence-case text (`Pit`, `Out`, `In`), race control messages sentence-cased for display.
- One ECharts theme (`chartTheme(p)`): 11 px Plex labels in text-3, no y axis line, hairline grid, dashed crosshair,
  inverse tooltip, 1.5 px lines, no symbols by default, consistent grid margins.
- Track status as a quiet line with a 10 px flag square, not a saturated block; sector flags as text.
- Rebalanced presets (see `lib/workbench/presets.ts`).

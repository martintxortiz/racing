"use client";
import { useMemo } from "react";
import { EChart, type EChartsOption } from "@/charts/EChart";
import { axisStyle, FS, useChartTheme } from "@/charts/theme";
import { fmtGap } from "@/data/format";
import { indexAtOrBefore } from "@/derive/search";
import { statusSpans } from "@/derive/status";
import { raceHistory } from "@/derive/history";
import { seriesFor } from "@/derive/timing";
import { sep } from "@/menus/types";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { openEntityMenu } from "@/ui/actions";
import { clockTicks, timeOfDay } from "@/ui/clock";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { useSelection, useT } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./gaps.module.css";

export interface GapsConfig {
  /** "history": lap crossings against the winner's average pace. "leader": the timing feed's gap to the current leader. */
  mode?: "history" | "leader";
  top?: number;
  /** Cap on the y axis in seconds so lapped cars do not flatten the field. */
  cap?: number;
}

function Gaps({ session, config, setConfig, width, height }: WidgetProps<GapsConfig>) {
  const t = useT(2);
  const th = useChartTheme();
  const panel = usePanel();
  const clock = useApp((s) => s.settings.clock);
  // Emphasise A and B; with nothing chosen, the implicit pair (top two) leads the eye.
  const sel = useSelection(session, Math.floor(t / 2) * 2);
  const focus = sel.a?.entity ?? null;
  const compare = sel.b?.entity ?? null;
  const cap = config.cap ?? (config.mode === "leader" ? 60 : 90);
  const top = config.top ?? 10;
  const tk = Math.floor(t / 2) * 2;

  const mode = config.mode ?? "history";
  const lines = useMemo(() => {
    const out: { id: string; data: { value: [number, number]; lap?: number; symbol?: string; symbolSize?: number }[] }[] = [];
    if (mode === "history") {
      const h = raceHistory(session);
      for (const e of session.entities) {
        const pts = h.lines.get(e.id) ?? [];
        out.push({ id: e.id, data: pts.map((p) => ({ value: [p.t, p.gap] as [number, number], lap: p.lap, ...(p.pit ? { symbol: "circle", symbolSize: 5 } : {}) })) });
      }
      return out;
    }
    if (!session.intervals) return out;
    for (const e of session.entities) {
      const [ts, vs] = seriesFor(session.intervals, e.id, "gap_to_leader_s");
      const data: { value: [number, number] }[] = [];
      // Thin to ~1 point per 5 s; the feed is far denser than a chart needs.
      let lastT = -Infinity;
      for (let i = 0; i < ts.length; i++) {
        if (ts[i] - lastT < 5) continue;
        if (!Number.isFinite(vs[i])) continue;
        lastT = ts[i];
        data.push({ value: [ts[i], vs[i]] });
      }
      out.push({ id: e.id, data });
    }
    return out;
  }, [session, mode]);

  // History mode grows with the replay: the axis ends just past the cursor (at least a
  // quarter of the race shown) so lines use the full width instead of half an empty chart.
  const xRange = useMemo<[number, number]>(() => {
    const seg = session.segments[0];
    const [a, b] = seg ? [seg.t0, seg.t1] : session.window;
    if (mode !== "history") return [a, b];
    const span = b - a;
    return [a, Math.min(b, Math.max(a + span * 0.25, Math.ceil((tk + span * 0.03) / 60) * 60))];
  }, [session, mode, tk]);

  const { option, labels } = useMemo<{ option: EChartsOption; labels: EndLabel[] }>(() => {
    const ax = axisStyle(th);
    const xr = xRange;
    const ticks = clockTicks(session, xr[0], xr[1], clock, Math.max(3, Math.floor(width / 80)));
    let allowed: Set<string> | null = null;
    if (top > 0) {
      const at = lines.map((l) => ({ id: l.id, v: l.data[Math.max(0, indexAtOrBefore(l.data.map((p) => p.value[0]), tk))]?.value[1] ?? Infinity })).sort((a, b) => a.v - b.v);
      allowed = new Set(at.slice(0, top).map((x) => x.id));
      if (focus) allowed.add(focus);
      if (compare) allowed.add(compare);
    }
    const series = lines
      .filter((l) => !allowed || allowed.has(l.id))
      .map((l) => {
        const e = session.entityById.get(l.id)!;
        const isA = l.id === focus;
        const isB = l.id === compare;
        const hot = isA || isB;
        const i = indexAtOrBefore(l.data.map((p) => p.value[0]), tk);
        const colour = isA ? th.a : isB ? th.b : e.colour;
        return {
          type: "line",
          name: e.code,
          entity: l.id,
          data: l.data.slice(0, i + 1),
          showSymbol: mode === "history",
          symbol: "none",
          itemStyle: { color: colour, opacity: hot ? 1 : 0.5 },
          sampling: mode === "history" ? undefined : "lttb",
          lineStyle: { width: hot ? 2.2 : 1, color: colour, opacity: hot ? 1 : 0.4 },
          z: hot ? 5 : 2,
          emphasis: { focus: "series", lineStyle: { width: 2.2, opacity: 1 } },
          blur: { lineStyle: { opacity: 0.15 } },
        };
      });
    const areas = statusSpans(session.events, session.window[1])
      .filter((s) => s.state === "sc" || s.state === "vsc" || s.state === "red")
      .map((s) => [{ xAxis: s.t0, name: s.state === "sc" ? "SC" : s.state === "vsc" ? "VSC" : "Red", itemStyle: { color: s.state === "red" ? th.red : th.sc } }, { xAxis: s.t1 }]);
    if (series[0]) {
      Object.assign(series[0], {
        markArea: { silent: true, label: { color: th.text3, fontSize: FS.xs, position: "insideTopLeft" }, data: areas },
        markLine: { silent: true, symbol: "none", label: { show: false }, data: [{ xAxis: tk, lineStyle: { color: th.text2, width: 1, type: "solid" } }] },
      });
    }
    // Fit the y axis to the cars on show: from the best visible value to just past
    // the slowest car's current gap, never more than `cap` seconds. Lapped cars and
    // the odd pit-stop bump beyond that run off the bottom instead of flattening the field.
    let y0 = 0;
    let y1 = cap;
    {
      let lo = Infinity;
      let hiNow = -Infinity;
      for (const sr of series) {
        for (const p of sr.data) lo = Math.min(lo, p.value[1]);
        const last = sr.data[sr.data.length - 1];
        if (last) hiNow = Math.max(hiNow, last.value[1]);
      }
      if (mode === "history") y0 = Number.isFinite(lo) ? Math.floor(lo / 5) * 5 : 0;
      if (Number.isFinite(hiNow)) y1 = Math.min(y0 + cap, Math.max(y0 + 10, Math.ceil((hiNow + 4) / 5) * 5));
    }
    // End labels are spread so none overlap; ECharts end labels pile up when the field is close.
    const px = (x: number) => GRID.left + ((x - xr[0]) / (xr[1] - xr[0] || 1)) * (width - GRID.left - GRID.right);
    const py = (v: number) => GRID.top + ((Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0 || 1)) * (height - GRID.top - GRID.bottom);
    const ends = series
      .map((sr) => {
        const last = sr.data[sr.data.length - 1];
        const hot = sr.entity === focus || sr.entity === compare;
        const colour = sr.entity === focus ? th.a : sr.entity === compare ? th.b : th.text3;
        return last ? { id: sr.entity, code: sr.name, colour, hot, x: px(last.value[0]), y: py(last.value[1]) } : null;
      })
      .filter((x): x is EndLabel => !!x);
    const labels = spreadLabels(ends, GRID.top, height - GRID.bottom, LABEL_H);
    return { labels, option: {
      grid: GRID,
      tooltip: {
        trigger: "axis",
        backgroundColor: th.panel,
        borderColor: th.line2,
        textStyle: { color: th.text, fontSize: FS.sm, fontFamily: th.sans },
        axisPointer: { type: "line", lineStyle: { color: th.line2 } },
        formatter: (ps: { seriesName: string; value: [number, number]; color: string; data: { lap?: number } }[]) => {
          const rows = [...ps].sort((a, b) => a.value[1] - b.value[1]).slice(0, 12);
          const head = rows[0] ? timeOfDay(session, rows[0].value[0], clock, false).text : "";
          const lead = rows[0]?.value[1] ?? 0;
          return `${head}<br/>` + rows.map((p) => {
            const v = mode === "history" ? p.value[1] - lead : p.value[1];
            const lap = p.data?.lap != null ? ` <span style="color:${th.text3}">lap ${p.data.lap}</span>` : "";
            return `<span style="color:${p.color}">●</span> ${p.seriesName} <span style="font-family:${th.mono}">${fmtGap(v, 1)}</span>${lap}`;
          }).join("<br/>");
        },
      },
      xAxis: {
        type: "value",
        min: xr[0],
        max: xr[1],
        ...ax,
        splitLine: { show: false },
        axisLabel: { ...ax.axisLabel, hideOverlap: true, formatter: (v: number) => timeOfDay(session, v, clock, false).text, customValues: ticks },
        axisTick: { show: false, customValues: ticks },
      },
      yAxis: { type: "value", inverse: true, min: y0, max: y1, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => `${v}s` } },
      series,
    } };
  }, [lines, th, session, tk, focus, compare, cap, top, clock, width, height, mode, xRange]);

  const modeMenu = [
    { id: "mode-history", label: "Race history (vs the leader's average lap)", checked: mode === "history", run: () => setConfig({ mode: "history" }) },
    { id: "mode-leader", label: "Gap to current leader (timing feed)", checked: mode === "leader", disabled: !session.intervals, run: () => setConfig({ mode: "leader" }) },
  ];
  const capMenu = [30, 60, 90, 120].map((c) => ({ id: `cap${c}`, label: `Span ${c} s`, checked: cap === c, run: () => setConfig({ cap: c }) }));
  const topMenu = [0, 5, 10].map((n) => ({ id: `top${n}`, label: n ? `Top ${n} plus A and B` : "Every car", checked: top === n, run: () => setConfig({ top: n }) }));
  return (
    <>
      <HeaderSlot>
        <span>{mode === "history" ? "vs the leader's average lap" : "gap to current leader"}{top ? `, top ${top} plus A and B` : ""}</span>
      </HeaderSlot>
      <EChart
        option={option}
        width={width}
        height={height}
        handlers={{
          click: (p) => {
            const id = (p as { seriesIndex: number; componentType: string; seriesName: string }).seriesName;
            const e = session.entities.find((x) => x.code === id);
            if (e) useApp.getState().setFocus(e.id);
          },
          contextmenu: (p) => {
            const pp = p as { seriesName: string; event?: { event?: MouseEvent } };
            const e = session.entities.find((x) => x.code === pp.seriesName);
            if (e && pp.event?.event) openEntityMenu(pp.event.event, e.id);
          },
        }}
        onZr={{
          click: (e) => {
            if (e.target) return;
            // Click empty chart area: move the replay cursor there.
            const x = e.offsetX;
            const x0 = GRID.left, x1 = width - GRID.right;
            if (x < x0 || x > x1) return;
            useCursor.getState().setT(xRange[0] + ((x - x0) / (x1 - x0)) * (xRange[1] - xRange[0]));
          },
          contextmenu: (e) => {
            if (e.target) return;
            openMenu(e.event, [{ kind: "label", label: "Measure" }, ...modeMenu, sep, { kind: "label", label: "Y axis" }, ...capMenu, sep, { kind: "label", label: "Cars" }, ...topMenu, sep, { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Race gaps");
          },
        }}
      />
      {labels.map((l) => (
        <span key={l.id} className={css.end} style={{ left: l.x + 6, top: l.y - LABEL_H / 2, color: l.colour, fontWeight: l.hot ? 600 : 400 }}>
          {l.code}
        </span>
      ))}
    </>
  );
}

const GRID = { left: 44, right: 52, top: 12, bottom: 24 };
const LABEL_H = 14;

interface EndLabel {
  id: string;
  code: string;
  colour: string;
  hot: boolean;
  x: number;
  y: number;
}

/**
 * Moves labels apart vertically so none overlap, keeping each as close to its line end as it can.
 * When the plot is too short for all of them, A and B are kept and the rest go top to bottom.
 */
export function spreadLabels<T extends { y: number; hot: boolean }>(items: T[], top: number, bottom: number, h: number): T[] {
  const room = Math.max(1, Math.floor((bottom - top) / h));
  const keep = items.length <= room ? items : [...items.filter((x) => x.hot), ...items.filter((x) => !x.hot).sort((a, b) => a.y - b.y)].slice(0, room);
  const out = keep.map((x) => ({ ...x })).sort((a, b) => a.y - b.y);
  for (let i = 0; i < out.length; i++) out[i].y = Math.max(out[i].y, i ? out[i - 1].y + h : top + h / 2);
  for (let i = out.length - 1; i >= 0; i--) out[i].y = Math.min(out[i].y, i < out.length - 1 ? out[i + 1].y - h : bottom - h / 2);
  return out;
}

export const gapsWidget: WidgetDef<GapsConfig> = {
  type: "gaps",
  name: "Race gaps",
  description: "Race history from lap crossings, pit laps marked, safety car periods shaded",
  group: "Timing",
  unavailable: (s) => (s.kind === "race" && s.laps.length ? null : "Needs race lap timing."),
  Component: Gaps,
  menu: ({ config, setConfig }) => [30, 60, 90, 120].map((c) => ({ id: `cap${c}`, label: `Y axis spans ${c} s`, checked: (config.cap ?? (config.mode === "leader" ? 60 : 90)) === c, run: () => setConfig({ cap: c }) })),
};

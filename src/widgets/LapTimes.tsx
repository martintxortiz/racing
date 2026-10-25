"use client";
import { useMemo } from "react";
import { EChart, type EChartsOption } from "@/charts/EChart";
import { axisStyle, useChartTheme } from "@/charts/theme";
import { fmtLap } from "@/data/format";
import type { Lap } from "@/derive/model";
import { statusSpans } from "@/derive/status";
import { sep } from "@/menus/types";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { clockTicks, timeOfDay } from "@/ui/clock";
import { openEntityMenu } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { useSelection, useT } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";

export interface LapTimesConfig {
  scope?: "focus" | "all";
  clip?: boolean;
  showDeleted?: boolean;
}

const CROSS = "path://M2,0L5,3L8,0L10,2L7,5L10,8L8,10L5,7L2,10L0,8L3,5L0,2Z";

function LapTimes({ session, config, setConfig, width, height }: WidgetProps<LapTimesConfig>) {
  const t = useT(4);
  const th = useChartTheme();
  const panel = usePanel();
  const clock = useApp((s) => s.settings.clock);
  // Same A/B as the comparison widgets: the chosen pair, or the top two.
  const sel = useSelection(session, t);
  const focus = sel.a?.entity ?? null;
  const compare = sel.b?.entity ?? null;
  const race = session.kind === "race";
  const clip = config.clip !== false;
  const showDeleted = config.showDeleted !== false;
  const teamColours = config.scope === "all";
  // Coarse time key: laps only appear when they finish.
  const tk = Math.floor(t);

  const { pts, best } = useMemo(() => {
    const pts: { lap: Lap; x: number; y: number }[] = [];
    let best = Infinity;
    for (const l of session.laps) {
      if (l.time == null || l.t1 == null || l.t1 > tk) continue;
      if (l.pitIn || l.pitOut) continue;
      if (l.deleted && !showDeleted) continue;
      pts.push({ lap: l, x: race ? l.n : l.t1, y: l.time });
      if (l.valid) best = Math.min(best, l.time);
    }
    return { pts, best: Number.isFinite(best) ? best : null };
  }, [session, tk, race, showDeleted]);

  const option = useMemo<EChartsOption>(() => {
    const ax = axisStyle(th);
    const yMax = clip && best != null ? best * (race ? 1.1 : 1.07) : undefined;
    const pick = (fn: (p: (typeof pts)[number]) => boolean) =>
      pts.filter(fn).map((p) => ({ value: [p.x, p.y], entity: p.lap.entity, n: p.lap.n, deleted: p.lap.deleted }));
    const sel = (id: string | null) => (p: (typeof pts)[number]) => p.lap.entity === id && !p.lap.deleted;
    const base = { type: "scatter", symbolSize: 6, emphasis: { scale: 1.6 } };
    const series: unknown[] = [
      {
        ...base,
        name: "laps",
        data: pick((p) => !p.lap.deleted && p.lap.entity !== focus && p.lap.entity !== compare),
        itemStyle: {
          color: teamColours ? (p: { data: { entity: string } }) => session.entityById.get(p.data.entity)?.colour ?? th.muted : th.muted,
          opacity: teamColours ? 0.8 : focus || compare ? 0.55 : 0.85,
        },
        z: 1,
      },
      { ...base, name: "deleted", data: pick((p) => p.lap.deleted), symbol: CROSS, symbolSize: 7, itemStyle: { color: th.text3 }, z: 2 },
    ];
    for (const [id, col] of [[compare, th.b], [focus, th.a]] as const) {
      if (!id) continue;
      series.push({
        ...base,
        type: race ? "line" : "scatter",
        showSymbol: true,
        symbol: "circle",
        name: id,
        data: pick(sel(id)).sort((a, b) => a.value[0] - b.value[0]),
        itemStyle: { color: col },
        lineStyle: { color: col, width: 1.25 },
        connectNulls: false,
        symbolSize: 7,
        z: 5,
      });
    }
    const marks: unknown[] = [];
    const areas: unknown[] = [];
    if (!race) {
      session.segments.forEach((s, i) => {
        areas.push([{ xAxis: s.t0, name: s.label, itemStyle: { color: i % 2 ? "transparent" : th.band } }, { xAxis: s.t1 }]);
      });
      marks.push({ xAxis: Math.min(t, session.window[1]), lineStyle: { color: th.text2, type: "solid", width: 1 }, label: { show: false } });
    } else {
      // SC / VSC laps as bands, mapped to the leader's lap numbers.
      const lapAt = (time: number) => {
        let n = 0;
        for (const l of session.laps) if (l.t0 <= time && l.n > n) n = l.n;
        return n;
      };
      for (const sp of statusSpans(session.events, session.window[1])) {
        if (sp.state !== "sc" && sp.state !== "vsc" && sp.state !== "red") continue;
        areas.push([{ xAxis: lapAt(sp.t0) - 0.5, name: sp.state === "sc" ? "SC" : sp.state === "vsc" ? "VSC" : "Red", itemStyle: { color: sp.state === "red" ? th.red : th.sc } }, { xAxis: lapAt(sp.t1) + 0.5 }]);
      }
    }
    if (best != null) marks.push({ yAxis: best, lineStyle: { color: th.sb, type: "dashed", width: 1 }, label: { show: true, position: "insideEndTop", formatter: `best ${fmtLap(best)}`, color: th.sb, fontFamily: th.mono, fontSize: 10.5 } });
    (series[0] as Record<string, unknown>).markLine = { silent: true, symbol: "none", data: marks };
    (series[0] as Record<string, unknown>).markArea = { silent: true, label: { color: th.text3, fontSize: 10.5, fontFamily: th.sans, position: "insideTopLeft" }, data: areas };
    return {
      grid: { left: 58, right: 14, top: 12, bottom: 26 },
      tooltip: {
        trigger: "item",
        backgroundColor: th.panel,
        borderColor: th.line2,
        padding: [4, 8],
        textStyle: { color: th.text, fontSize: 11.5, fontFamily: th.sans },
        formatter: (p: { data: { entity: string; n: number; value: number[]; deleted: boolean } }) => {
          const e = session.entityById.get(p.data.entity);
          return `<b>${e?.code ?? p.data.entity}</b> lap ${p.data.n} &nbsp;<span style="font-family:${th.mono}">${fmtLap(p.data.value[1])}</span>${p.data.deleted ? " &nbsp;deleted" : ""}`;
        },
      },
      xAxis: {
        type: "value",
        min: race ? 1 : session.window[0],
        max: race ? session.totalLaps ?? undefined : session.window[1],
        ...ax,
        splitLine: { show: race, lineStyle: { color: th.line } },
        axisLabel: { ...ax.axisLabel, hideOverlap: true, formatter: race ? (v: number) => `${v}` : (v: number) => timeOfDay(session, v, clock, false).text, customValues: race ? undefined : clockTicks(session, session.window[0], session.window[1], clock, Math.max(3, Math.floor(width / 80))) },
        axisTick: { show: false, customValues: race ? undefined : clockTicks(session, session.window[0], session.window[1], clock, Math.max(3, Math.floor(width / 80))) },
        minInterval: race ? 1 : undefined,
      },
      yAxis: {
        type: "value",
        scale: true,
        max: yMax ? Math.ceil(yMax) : undefined,
        ...ax,
        axisLabel: { ...ax.axisLabel, formatter: (v: number) => fmtLap(v).replace(/\.\d+$/, "") },
      },
      series,
    };
  }, [pts, best, th, clip, race, focus, compare, session, t, clock, teamColours, width]);

  return (
    <>
      <HeaderSlot>
        <span>{race ? "by lap" : "by time"}{clip ? `, laps within ${race ? "110" : "107"}%` : ""}</span>
      </HeaderSlot>
      <EChart
        option={option}
        width={width}
        height={height}
        handlers={{
          click: (p) => {
            const d = (p as { data?: { entity: string; n: number } }).data;
            if (!d?.entity) return;
            const ev = (p as { event?: { event?: MouseEvent } }).event?.event;
            const st = useApp.getState();
            if (ev && (ev.shiftKey || ev.metaKey || ev.ctrlKey)) st.setCompare(d.entity, d.n);
            else st.setFocus(d.entity, d.n);
          },
          contextmenu: (p) => {
            const d = (p as { data?: { entity: string; n: number } }).data;
            const ev = (p as { event?: { event?: MouseEvent } }).event?.event;
            if (!d?.entity || !ev) return;
            ev.preventDefault();
            const lap = session.lapsByEntity.get(d.entity)?.find((l) => l.n === d.n);
            openEntityMenu(ev, d.entity, [
              { id: "fl", label: `Focus lap ${d.n}`, run: () => useApp.getState().setFocus(d.entity, d.n) },
              { id: "cl", label: `Compare lap ${d.n}`, run: () => useApp.getState().setCompare(d.entity, d.n) },
              ...(lap ? [{ id: "jump", label: `Jump to the end of lap ${d.n}`, run: () => useCursor.getState().setT(lap.t1 ?? lap.t0) }] : []),
            ]);
          },
        }}
        onZr={{
          contextmenu: (e) => {
            if (e.target) return;
            const ev = e.event;
            openMenu(ev, [
              { id: "scope", label: "Team colours for every car", checked: teamColours, run: () => setConfig({ scope: teamColours ? "focus" : "all" }) },
              { id: "clip", label: `Hide laps over ${race ? "110" : "107"}%`, checked: clip, run: () => setConfig({ clip: !clip }) },
              { id: "del", label: "Show deleted laps", checked: showDeleted, run: () => setConfig({ showDeleted: !showDeleted }) },
              sep,
              { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
            ], "Lap times");
          },
        }}
      />
    </>
  );
}

export const laptimesWidget: WidgetDef<LapTimesConfig> = {
  type: "laptimes",
  name: "Lap times",
  description: "Every completed lap; qualifying by time with phase bands, race by lap number",
  group: "Timing",
  unavailable: (s) => (s.laps.length ? null : "This file has no lap timing."),
  Component: LapTimes,
  menu: ({ config, setConfig }) => [
    { id: "clip", label: "Hide slow laps", checked: config.clip !== false, run: () => setConfig({ clip: config.clip === false }) },
    { id: "del", label: "Show deleted laps", checked: config.showDeleted !== false, run: () => setConfig({ showDeleted: config.showDeleted === false }) },
  ],
};

"use client";
import { useMemo } from "react";
import { EChart, type EChartsOption } from "@/charts/EChart";
import { axisStyle, useChartTheme } from "@/charts/theme";
import type { Columns, TopicInfo } from "@/data/types";
import { indexAtOrAfter, indexAtOrBefore } from "@/derive/search";
import { topicFor } from "@/derive/topics";
import { sep, type MenuItem } from "@/menus/types";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { clockTicks, timeOfDay } from "@/ui/clock";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { fieldTitle, plottable } from "./fields";
import { useSelection, useT, useTopics } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";

export interface SignalConfig {
  /** Topic name, or a per-entity pattern such as /car/* /telemetry. */
  topic?: string;
  field?: string;
  /** Seconds of history before the replay time; 0 shows the whole session. */
  window?: number;
}

const ENTITY_FIELDS = ["entity_id", "driver_number", "car_number", "entity"];

/** Topics (and per-entity patterns) that have numeric fields worth plotting. */
export function signalSources(topics: TopicInfo[]): { topic: string; fields: string[]; perEntity: boolean }[] {
  const out = new Map<string, { topic: string; fields: string[]; perEntity: boolean }>();
  for (const t of topics) {
    if (t.name.startsWith("/scene/") || t.rows) continue;
    const fields = plottable(t.fields.filter((f) => f.kind === "num").map((f) => f.name));
    if (!fields.length) continue;
    const key = t.pattern ?? t.name;
    if (!out.has(key)) out.set(key, { topic: key, fields, perEntity: !!t.pattern });
  }
  // Per-car topics first; among those, the richest (telemetry before a bare x/y/z pose).
  return [...out.values()].sort((a, b) => Number(b.perEntity) - Number(a.perEntity) || b.fields.length - a.fields.length || a.topic.localeCompare(b.topic));
}

function entityColumn(c: Columns): (string | null)[] | null {
  for (const k of ENTITY_FIELDS) {
    if (c.str[k]) return c.str[k];
    if (c.num[k]) return Array.from(c.num[k], (v) => (Number.isFinite(v) ? String(v) : null));
  }
  return null;
}

function SignalPlot({ session, config, setConfig, width, height }: WidgetProps<SignalConfig>) {
  const t = useT(6);
  const th = useChartTheme();
  const panel = usePanel();
  const clock = useApp((s) => s.settings.clock);
  const summary = useApp((s) => s.summary);
  const sel = useSelection(session, t);
  const sources = useMemo(() => signalSources(summary?.topics ?? []), [summary]);
  const src = sources.find((s) => s.topic === config.topic) ?? sources[0];
  const field = src && config.field && src.fields.includes(config.field) ? config.field : src?.fields.find((f) => /speed/.test(f)) ?? src?.fields[0];
  const win = config.window ?? 120;
  const entKey = [sel.a?.entity, sel.b?.entity].filter(Boolean).join("|");
  const ents = useMemo(() => (entKey ? entKey.split("|") : []), [entKey]);
  const topics = src ? (src.perEntity ? ents.map((e) => topicFor(src.topic, e)) : [src.topic]) : [];
  const { cols, loading } = useTopics(topics);

  const option = useMemo<EChartsOption>(() => {
    const ax = axisStyle(th);
    const x0 = win > 0 ? t - win : session.window[0];
    const x1 = win > 0 ? t : session.window[1];
    const ticks = clockTicks(session, x0, x1, clock, Math.max(3, Math.floor(width / 120)));
    const series: unknown[] = [];
    const add = (c: Columns | undefined, colour: string, name: string, only?: string) => {
      if (!c || !field || !c.num[field]) return;
      const v = c.num[field];
      const ec = only ? entityColumn(c) : null;
      const a = Math.max(0, indexAtOrAfter(c.t, x0) - 1);
      const b = Math.min(c.n - 1, indexAtOrBefore(c.t, Math.min(x1, t)) );
      const data: [number, number][] = [];
      for (let i = a; i <= b; i++) {
        if (ec && ec[i] !== only) continue;
        if (Number.isFinite(v[i])) data.push([c.t[i], v[i]]);
      }
      series.push({ type: "line", name, data, showSymbol: false, sampling: "lttb", lineStyle: { width: 1.4, color: colour }, itemStyle: { color: colour } });
    };
    if (src?.perEntity) {
      ents.forEach((e, i) => add(cols[topicFor(src.topic, e)], i === 0 ? th.a : th.b, session.entityById.get(e)?.code ?? e));
    } else if (src) {
      const c = cols[src.topic];
      if (c && entityColumn(c) && ents.length) ents.forEach((e, i) => add(c, i === 0 ? th.a : th.b, session.entityById.get(e)?.code ?? e, e));
      else add(c, th.text2, field ?? "");
    }
    return {
      grid: { left: 52, right: 14, top: 12, bottom: 24 },
      tooltip: {
        trigger: "axis",
        backgroundColor: th.panel,
        borderColor: th.line2,
        textStyle: { color: th.text, fontSize: 11, fontFamily: th.sans },
        valueFormatter: (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)),
      },
      xAxis: { type: "value", min: x0, max: x1, ...ax, splitLine: { show: false }, axisLabel: { ...ax.axisLabel, hideOverlap: true, formatter: (v: number) => timeOfDay(session, v, clock, win === 0 || win > 300 ? false : true).text, customValues: ticks }, axisTick: { show: false, customValues: ticks } },
      yAxis: { type: "value", scale: true, ...ax, splitNumber: 4 },
      series,
    };
  }, [th, win, t, session, src, field, cols, ents, clock, width]);

  const menu = (): MenuItem[] => [
    {
      kind: "sub",
      id: "topic",
      label: "Topic",
      items: sources.map((s) => ({ id: `t:${s.topic}`, label: s.topic, hint: s.perEntity ? "per car" : undefined, checked: s.topic === src?.topic, run: () => setConfig({ topic: s.topic, field: undefined }) })),
    },
    { kind: "sub", id: "field", label: "Field", disabled: !src, items: (src?.fields ?? []).map((f) => ({ id: `f:${f}`, label: fieldTitle(f), checked: f === field, run: () => setConfig({ field: f }) })) },
    {
      kind: "sub",
      id: "window",
      label: "Time range",
      items: [30, 120, 600, 0].map((w) => ({ id: `w${w}`, label: w ? `Last ${w >= 60 ? `${w / 60} min` : `${w} s`}` : "Whole session", checked: win === w, run: () => setConfig({ window: w }) })),
    },
  ];

  return (
    <>
      <HeaderSlot>
        <span>
          {src?.topic} · {field ? fieldTitle(field) : "no numeric field"}
          {loading ? " · loading" : ""}
        </span>
      </HeaderSlot>
      <EChart
        option={option}
        width={width}
        height={height}
        onZr={{
          click: (e) => {
            if (win !== 0) return;
            const x0 = 52, x1 = width - 14;
            if (e.offsetX < x0 || e.offsetX > x1) return;
            useCursor.getState().setT(session.window[0] + ((e.offsetX - x0) / (x1 - x0)) * (session.window[1] - session.window[0]));
          },
          contextmenu: (e) => openMenu(e.event, [...menu(), sep, { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Signal"),
        }}
      />
    </>
  );
}

export const signalWidget: WidgetDef<SignalConfig> = {
  type: "signal",
  name: "Signal",
  description: "Any numeric field of any topic against time, for A and B on per-car topics",
  group: "Telemetry",
  unavailable: (_s, summary) => (signalSources(summary.topics).length ? null : "No topic in this file has numeric fields."),
  Component: SignalPlot,
};

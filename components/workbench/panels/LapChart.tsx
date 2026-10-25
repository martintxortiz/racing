"use client";

import { useEffect, useMemo, useRef } from "react";

import { fmtClock, fmtLap } from "@/lib/workbench/format";
import type { Lap } from "@/lib/workbench/types";
import { useEntityStyles, usePalette } from "../colors";
import { axisStyle, EChart, type EChartsInstance, type EChartsOption } from "../EChart";
import { setA, setB, setT, useWB } from "../state";
import { rowMenu } from "./TimingTable";
import { Empty, Readout, Skeleton, useThrottledT, useTopicState, type PanelDef, type PanelProps } from "./common";

const CROSS = "path://M0,0L10,10M10,0L0,10";

function LapChart({ panel, setConfig }: PanelProps) {
  const p = usePalette();
  const styles = useEntityStyles();
  const derived = useWB((s) => s.derived);
  const a = useWB((s) => s.a);
  const b = useWB((s) => s.b);
  const hoverEntity = useWB((s) => s.hoverEntity);
  const t = useThrottledT(4);
  const state = useTopicState(panel.bindings.laps ?? "/timing/laps");
  const filter = String(panel.config.filter ?? "timed");
  const who = String(panel.config.entities ?? "all");
  const chart = useRef<EChartsInstance | null>(null);
  const cursorEl = useRef<HTMLDivElement>(null);

  const { laps, yRange, pbs } = useMemo(() => {
    const all = (derived?.laps ?? []).filter((l) => l.time !== null && l.t1 !== null);
    const laps = all.filter((l) => (filter === "all" ? true : !l.outLap && (l.timed || l.deleted)));
    // Y range from timed laps: fastest − 0.5 s to the 107% band (slow laps get clipped at the top).
    const times = laps.filter((l) => l.timed && !l.deleted).map((l) => l.time!);
    const min = times.length ? Math.min(...times) : 0;
    const pbs = new Set<Lap>();
    for (const ls of derived?.lapsByEntity.values() ?? []) {
      let best: Lap | null = null;
      for (const l of ls) if (l.timed && !l.deleted && l.time !== null && (!best || l.time < best.time!)) best = l;
      if (best) pbs.add(best);
    }
    return { laps, yRange: [Math.floor((min - 0.5) * 2) / 2, Math.ceil(min * 1.07)], pbs };
  }, [derived, filter]);

  const option = useMemo<EChartsOption>(() => {
    if (!derived) return {};
    const ax = axisStyle(p);
    const [w0, w1] = useWB.getState().session?.window ?? [0, 1];
    const visible = laps.filter((l) => who === "all" || l.entity === a || l.entity === b);
    const point = (l: Lap) => {
      const role = l.entity === a ? "a" : l.entity === b ? "b" : null;
      const st = styles.get(l.entity);
      const dim = panel.config.dimOthers !== false && (a || b) && !role && l.entity !== hoverEntity;
      const future = l.t1! > t;
      const colour = role === "a" ? p.a : role === "b" ? p.b : (st?.colour ?? p.text3);
      const opacity = (future ? 0.15 : 1) * (dim ? 0.18 : 1);
      return {
        value: [l.t1, Math.min(l.time!, yRange[1]), l.entity, l.n],
        symbol: l.deleted ? CROSS : "circle",
        symbolSize: l.deleted ? 7 : role ? 7 : 5,
        itemStyle: l.deleted
          ? { color: "transparent", borderColor: colour, borderWidth: 1.5, opacity }
          : pbs.has(l)
            ? { color: colour, borderColor: p.text1, borderWidth: 1.5, opacity }
            : { color: st?.second && !role ? p.bg : colour, borderColor: colour, borderWidth: st?.second && !role ? 1.25 : 0, opacity },
        z: role ? 4 : 2,
      };
    };
    const lineFor = (e: string | null, colour: string, id: string) => ({
      id,
      type: "line",
      data: e ? laps.filter((l) => l.entity === e && l.timed && !l.deleted).map((l) => [l.t1, Math.min(l.time!, yRange[1])]) : [],
      showSymbol: false,
      silent: true,
      lineStyle: { color: colour, width: 1, opacity: 0.6 },
      z: 3,
    });
    const segs = derived.segments;
    return {
      animation: false,
      grid: { left: 58, right: 12, top: 10, bottom: 24 },
      xAxis: {
        type: "value",
        min: w0,
        max: w1,
        ...ax,
        splitLine: { show: false },
        axisLabel: {
          ...ax.axisLabel,
          formatter: (v: number) => {
            const s = [...segs].reverse().find((x) => v >= x.t0);
            return s ? `${s.id} ${fmtClock(v - s.t0, false)}` : fmtClock(v, false);
          },
        },
      },
      yAxis: {
        type: "value",
        min: yRange[0],
        max: yRange[1],
        ...ax,
        axisLabel: { ...ax.axisLabel, formatter: (v: number) => fmtLap(v) },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        borderWidth: 0,
        padding: 0,
        backgroundColor: "transparent",
        extraCssText: "box-shadow:none",
        formatter: (x: { value?: unknown[] }) => {
          if (!Array.isArray(x.value) || x.value.length < 4) return "";
          const l = derived.lapsByEntity.get(String(x.value[2]))?.find((q) => q.n === x.value![3]);
          if (!l) return "";
          const code = derived.entityById.get(l.entity)?.code ?? l.entity;
          const s = l.sectors.map((v) => (v === null ? "—" : v.toFixed(3))).join(" · ");
          return `<div class="pw-tooltip"><b>${code}</b> L${l.n} ${fmtLap(l.time)}${l.deleted ? " <s>deleted</s>" : ""}${pbs.has(l) ? " · PB" : ""}<br/><span class="pw-faint">${s}</span>${l.deletedReason ? `<br/><span class="pw-faint">${escapeHtml(l.deletedReason)}</span>` : ""}</div>`;
        },
      },
      series: [
        {
          id: "bands",
          type: "line",
          data: [],
          silent: true,
          markArea: {
            silent: true,
            itemStyle: { color: p.chrome },
            label: { show: true, position: "insideTopLeft", color: p.text3, fontSize: 11, fontFamily: p.font },
            data: segs.filter((_, i) => i % 2 === 1).map((s) => [{ xAxis: s.t0, name: s.id }, { xAxis: s.t1 ?? w1 }]),
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: p.grid, type: "solid" },
            label: { show: true, position: "insideStartTop", color: p.text3, fontSize: 11, fontFamily: p.font, formatter: (x: { name: string }) => x.name },
            data: segs.filter((_, i) => i % 2 === 0).map((s) => ({ xAxis: s.t0, name: s.id })),
          },
        },
        { id: "points", type: "scatter", data: visible.map(point), cursor: "pointer" },
        lineFor(b, p.b, "line-b"),
        lineFor(a, p.a, "line-a"),
      ],
    };
  }, [derived, laps, yRange, pbs, who, a, b, hoverEntity, t, p, styles, panel.config.dimOthers]);

  useEffect(() => {
    const place = () => {
      const el = cursorEl.current;
      const c = chart.current;
      if (!el || !c) return;
      const x = c.convertToPixel({ xAxisIndex: 0 }, useWB.getState().t);
      el.style.display = Number.isFinite(x) ? "block" : "none";
      el.style.transform = `translateX(${x}px)`;
    };
    place();
    let raf = 0;
    const unsub = useWB.subscribe((s, prev) => {
      if (s.t === prev.t) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [option]);

  if (state === "loading" && !laps.length) return <Skeleton rows={6} />;
  if (!laps.length) return <Empty title="No laps yet" />;

  return (
    <>
      <Readout>
        <button type="button" className="wb-textbtn" onClick={() => setConfig({ filter: filter === "all" ? "timed" : "all" })}>
          {filter === "all" ? "All laps" : "Timed laps"}
        </button>
        <span className="pw-faint">·</span>
        <button type="button" className="wb-textbtn" onClick={() => setConfig({ entities: who === "all" ? "ab" : "all" })}>
          {who === "all" ? "All drivers" : "A and B"}
        </button>
      </Readout>
      <EChart
        option={option}
        onReady={(c) => {
          chart.current = c;
          type Ev = { seriesId?: string; value?: unknown; event?: { event?: Event } };
          const lapOf = (e: Ev) => (e.seriesId === "points" && Array.isArray(e.value) ? { entity: String(e.value[2]), n: Number(e.value[3]), t1: Number(e.value[0]) } : null);
          c.on("click", (e: Ev) => {
            const l = lapOf(e);
            if (!l) return;
            if ((e.event?.event as MouseEvent | undefined)?.shiftKey) setB(l.entity, { n: l.n });
            else setA(l.entity, { n: l.n });
            setT(l.t1);
          });
          c.on("contextmenu", (e: Ev) => {
            const l = lapOf(e);
            const ev = e.event?.event as MouseEvent | undefined;
            if (!l || !ev) return;
            ev.preventDefault();
            ev.stopPropagation();
            rowMenu(l.entity, ev.clientX, ev.clientY, [
              { label: `Compare lap ${l.n} as A`, onSelect: () => setA(l.entity, { n: l.n }) },
              { label: `Compare lap ${l.n} as B`, onSelect: () => setB(l.entity, { n: l.n }) },
              { label: "Move cursor to lap end", onSelect: () => setT(l.t1) },
            ]);
          });
          c.on("mouseover", (e: Ev) => {
            const l = lapOf(e);
            if (l) useWB.setState({ hoverEntity: l.entity });
          });
          c.on("mouseout", () => useWB.setState({ hoverEntity: null }));
        }}
      >
        <div ref={cursorEl} className="wb-vline wb-vline--cursor" style={{ top: 10, bottom: 24 }} />
      </EChart>
    </>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export const lapChart: PanelDef = {
  type: "lap-chart",
  title: "Lap times",
  description: "Every lap over session time. Deleted laps are crosses, personal bests are ringed. Click a lap to compare it.",
  icon: "analytics",
  primary: "laps",
  slots: {
    laps: { schemas: ["rtc.laps"], required: true, default: "/timing/laps" },
    events: { schemas: ["rtc.events"], required: false, default: "/session/events" },
    stints: { schemas: ["rtc.stints"], required: false, default: "/timing/stints" },
  },
  defaultConfig: { filter: "timed", dimOthers: true, entities: "all" },
  settings: [
    { key: "filter", label: "Laps", options: [{ value: "timed", label: "Timed only" }, { value: "all", label: "All" }] },
    { key: "entities", label: "Drivers", options: [{ value: "all", label: "All" }, { value: "ab", label: "A and B" }] },
    { key: "dimOthers", label: "Dim others", options: [{ value: true, label: "On" }, { value: false, label: "Off" }] },
  ],
  Component: LapChart,
};

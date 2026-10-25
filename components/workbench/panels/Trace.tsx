"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { deltaTrace, interp, lapTrace, resolveLap, type LapTrace } from "@/lib/workbench/derive";
import { fmtLap, fmtSigned } from "@/lib/workbench/format";
import { resolveBinding } from "@/lib/workbench/layout";
import type { Lap, LapRef } from "@/lib/workbench/types";
import { usePalette } from "../colors";
import { axisStyle, EChart, type EChartsInstance, type EChartsOption } from "../EChart";
import { openMenu, setT, swapAB, useWB } from "../state";
import { Empty, Readout, Skeleton, useThrottledT, type PanelDef, type PanelProps } from "./common";

const CHANNELS: Record<string, { label: string; unit: string; weight: number; step?: boolean; digits: number }> = {
  delta: { label: "Δ", unit: "s", weight: 2, digits: 3 },
  speed_kph: { label: "Speed", unit: "km/h", weight: 4, digits: 0 },
  throttle_pct: { label: "Throttle", unit: "%", weight: 2, digits: 0 },
  brake_pct: { label: "Brake", unit: "%", weight: 1, step: true, digits: 0 },
  gear: { label: "Gear", unit: "", weight: 1.5, step: true, digits: 0 },
  rpm: { label: "RPM", unit: "", weight: 2, digits: 0 },
};
const PAD = { left: 52, right: 12, top: 18, bottom: 22, gap: 6 };

interface Grid {
  ch: string;
  top: number;
  height: number;
}

function layoutGrids(channels: string[], height: number): Grid[] {
  const total = channels.reduce((s, c) => s + CHANNELS[c].weight, 0);
  const avail = Math.max(40, height - PAD.top - PAD.bottom - PAD.gap * (channels.length - 1));
  let y = PAD.top;
  return channels.map((ch) => {
    const h = (avail * CHANNELS[ch].weight) / total;
    const g = { ch, top: y, height: h };
    y += h + PAD.gap;
    return g;
  });
}

function useLapPair() {
  const derived = useWB((s) => s.derived);
  const a = useWB((s) => s.a);
  const b = useWB((s) => s.b);
  const lapA = useWB((s) => s.lapA);
  const lapB = useWB((s) => s.lapB);
  // Only "cursor" refs depend on t; quantise to lap boundaries by resolving at throttled t.
  const t = useThrottledT(lapA === "cursor" || lapB === "cursor" ? 4 : 0.0001);
  const pick = (e: string | null, ref: LapRef): Lap | null => {
    if (!e || !derived) return null;
    const laps = derived.lapsByEntity.get(e);
    const l = resolveLap(laps, ref, t);
    return l && l.time !== null ? l : null;
  };
  return { a, b, la: pick(a, lapA), lb: pick(b, lapB) };
}

function Trace({ panel, setConfig }: PanelProps) {
  const p = usePalette();
  const derived = useWB((s) => s.derived);
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  const status = useWB((s) => s.status);
  const { a, b, la, lb } = useLapPair();
  const channels = ((panel.config.channels as string[]) ?? Object.keys(CHANNELS)).filter((c) => CHANNELS[c]);
  const showCorners = panel.config.corners !== false;
  const topicA = resolveBinding(panel.bindings.a ?? "/vehicle/{A}/telemetry", { a, b });
  const topicB = resolveBinding(panel.bindings.b ?? "/vehicle/{B}/telemetry", { a, b });
  const [height, setHeight] = useState(0);
  const chart = useRef<EChartsInstance | null>(null);
  const cursorEl = useRef<HTMLDivElement>(null);
  const hoverEl = useRef<HTMLDivElement>(null);
  const boxEl = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const traces = useMemo(() => {
    const L = derived?.lapLength ?? null;
    const mk = (topic: string | null, lap: Lap | null): LapTrace | null => {
      const tel = topic ? store.get(topic) : undefined;
      return tel && lap ? lapTrace(tel, lap, L) : null;
    };
    const ta = mk(topicA, la);
    const tb = mk(topicB, lb);
    return { ta, tb, delta: ta && tb ? deltaTrace(ta, tb) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, derived, topicA, topicB, la, lb]);
  const { ta, tb, delta } = traces;
  const live = useRef({ ta, la });
  useEffect(() => {
    live.current = { ta, la };
  });

  const chKey = channels.join(",");
  const grids = useMemo(() => layoutGrids(chKey.split(","), height), [chKey, height]);

  const option = useMemo<EChartsOption>(() => {
    if (!ta || !height) return {};
    const L = ta.length / 1000;
    const corners = showCorners
      ? ((store.get(panel.bindings.corners ?? "/track/corners")?.rows ?? []) as { number: number; letter?: string; distance_m?: number }[])
          .filter((c) => typeof c.distance_m === "number")
      : [];
    const ax = axisStyle(p);
    const series: object[] = [];
    grids.forEach((g, i) => {
      const def = CHANNELS[g.ch];
      const line = (tr: LapTrace, colour: string, id: string, dashed = false) => {
        const col = tr.channels[g.ch];
        const data: [number, number][] = new Array(tr.d.length);
        for (let j = 0; j < tr.d.length; j++) data[j] = [tr.d[j] / 1000, col[j]];
        return {
          id: `${g.ch}-${id}`,
          type: "line",
          xAxisIndex: i,
          yAxisIndex: i,
          data,
          showSymbol: false,
          step: def.step ? "end" : false,
          sampling: "lttb",
          silent: true,
          lineStyle: { color: colour, width: 1.25, type: dashed ? [4, 2] : "solid" },
          z: id === "a" ? 3 : 2,
        };
      };
      if (g.ch === "delta") {
        const data: [number, number][] = [];
        if (delta) for (let j = 0; j < delta.d.length; j++) data.push([delta.d[j] / 1000, delta.delta[j]]);
        series.push({
          id: "delta",
          type: "line",
          xAxisIndex: i,
          yAxisIndex: i,
          data,
          showSymbol: false,
          silent: true,
          lineStyle: { color: p.text1, width: 1.25 },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: p.axis, width: 1, type: "solid" },
            data: [{ yAxis: 0 }],
          },
        });
      } else {
        if (tb) series.push(line(tb, p.b, "b"));
        series.push(line(ta, p.a, "a"));
      }
      if (corners.length) {
        const s = series[series.length - 1] as Record<string, unknown>;
        const prev = (s.markLine as { data: object[] } | undefined)?.data ?? [];
        s.markLine = {
          silent: true,
          symbol: "none",
          animation: false,
          lineStyle: { color: p.grid, width: 1, type: "solid" },
          label: {
            show: i === 0,
            position: "end",
            formatter: (x: { name: string }) => x.name,
            color: p.text3,
            fontSize: 10,
            fontFamily: p.font,
            distance: 2,
          },
          data: [
            ...prev.map((d) => ({ ...d, lineStyle: { color: p.axis }, label: { show: false } })),
            ...corners.map((c) => ({ xAxis: c.distance_m! / 1000, name: `${c.number}${c.letter ?? ""}` })),
          ],
        };
      }
    });
    return {
      animation: false,
      grid: grids.map((g) => ({ left: PAD.left, right: PAD.right, top: g.top, height: g.height })),
      xAxis: grids.map((g, i) => ({
        type: "value",
        gridIndex: i,
        min: 0,
        max: L,
        ...ax,
        axisLabel: { ...ax.axisLabel, show: i === grids.length - 1, formatter: (v: number) => `${+v.toFixed(2)}` },
        name: i === grids.length - 1 ? "km" : undefined,
        nameLocation: "end",
        nameGap: 4,
        nameTextStyle: { ...ax.nameTextStyle, verticalAlign: "top", padding: [10, 0, 0, 0] },
      })),
      yAxis: grids.map((g, i) => ({
        type: "value",
        gridIndex: i,
        scale: g.ch !== "throttle_pct" && g.ch !== "brake_pct",
        min: g.ch === "throttle_pct" || g.ch === "brake_pct" ? 0 : undefined,
        max: g.ch === "throttle_pct" || g.ch === "brake_pct" ? 100 : undefined,
        splitNumber: Math.max(1, Math.floor(g.height / 28)),
        ...ax,
        axisLine: { show: false },
        axisLabel: {
          ...ax.axisLabel,
          fontSize: 11,
          formatter: (v: number) => (g.ch === "rpm" ? `${Math.round(v / 1000)}k` : g.ch === "delta" ? fmtSigned(v, 1) : `${v}`),
        },
      })),
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: grids.map((_, i) => i),
          filterMode: "none",
          zoomOnMouseWheel: true,
          moveOnMouseMove: false,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: false,
        },
      ],
      series,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ta, tb, delta, grids, p, showCorners, height]);

  // Cursor line: A's distance at the cursor, positioned outside React.
  useEffect(() => {
    const place = () => {
      const el = cursorEl.current;
      const c = chart.current && !chart.current.isDisposed() ? chart.current : null;
      const { ta, la } = live.current;
      if (!el) return;
      const tau = la ? useWB.getState().t - la.t0 : NaN;
      const x = c && ta && la && tau >= 0 && tau <= (la.time ?? 0) ? c.convertToPixel({ xAxisIndex: 0 }, interp(ta.tau, ta.d, tau) / 1000) : NaN;
      if (!Number.isFinite(x)) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.transform = `translateX(${x}px)`;
    };
    place();
    let raf = 0;
    const unsub = useWB.subscribe((s, prev) => {
      if (s.t === prev.t) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    });
    const c = chart.current;
    c?.on("datazoom", place);
    c?.on("finished", place);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      if (c && !c.isDisposed()) {
        c.off("datazoom", place);
        c.off("finished", place);
      }
    };
  }, [option]);

  if (status === "loading" && !ta) return <Skeleton rows={8} />;
  if (!a) return <Empty title="No driver selected">Click a timing row to set A; Shift+click for B.</Empty>;
  if (!topicA || !store.get(topicA)?.length)
    return <Empty title="No telemetry for A">{topicA ?? "Bind a telemetry topic"} has no data.</Empty>;
  if (!la || !ta) return <Empty title={`No timed lap for ${derived?.entityById.get(a)?.code ?? a}`}>Pick another driver or lap.</Empty>;

  const code = (e: string | null) => (e ? (derived?.entityById.get(e)?.code ?? e) : "");
  const valueAt = (tr: LapTrace | null, ch: string, d: number) => {
    if (!tr) return null;
    if (ch === "delta") return delta ? interp(delta.d, delta.delta, d) : null;
    return interp(tr.d, tr.channels[ch], d);
  };
  const kWarn = [ta, tb].find((x) => x && (x.k < 0.95 || x.k > 1.05));
  const fmt = (ch: string, v: number | null) =>
    v === null || !Number.isFinite(v) ? "—" : ch === "delta" ? fmtSigned(v) : v.toFixed(CHANNELS[ch].digits);

  const onMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const st = useWB.getState();
    const lapItems = (who: "A" | "B") => {
      const ent = who === "A" ? st.a : st.b;
      const ref = who === "A" ? st.lapA : st.lapB;
      const key = who === "A" ? "lapA" : "lapB";
      if (!ent) return [];
      const laps = (st.derived?.lapsByEntity.get(ent) ?? []).filter((l) => l.time !== null && !l.outLap);
      return [
        { heading: `Lap ${who} · ${code(ent)}` },
        { label: "Best", checked: ref === "best", onSelect: () => useWB.setState({ [key]: "best" }) },
        { label: "At cursor", checked: ref === "cursor", onSelect: () => useWB.setState({ [key]: "cursor" }) },
        ...laps.slice(-8).map((l) => ({
          label: `L${l.n}  ${fmtLap(l.time)}${l.deleted ? "  deleted" : ""}`,
          checked: typeof ref === "object" && ref.n === l.n,
          onSelect: () => useWB.setState({ [key]: { n: l.n } }),
        })),
      ];
    };
    openMenu(e.clientX, e.clientY, [
      ...lapItems("A"),
      ...(st.b ? [{ separator: true } as const, ...lapItems("B")] : []),
      { separator: true },
      { label: "Swap A/B", hint: "X", onSelect: swapAB },
      { label: "Reset zoom", hint: "Double-click", onSelect: () => chart.current?.dispatchAction({ type: "dataZoom", start: 0, end: 100 }) },
      { separator: true },
      { heading: "Channels" },
      ...Object.keys(CHANNELS).map((ch) => ({
        label: `${CHANNELS[ch].label}${CHANNELS[ch].unit ? ` (${CHANNELS[ch].unit})` : ""}`,
        checked: channels.includes(ch),
        disabled: channels.length === 1 && channels.includes(ch),
        onSelect: () =>
          setConfig({
            channels: Object.keys(CHANNELS).filter((c) => (c === ch ? !channels.includes(ch) : channels.includes(c))),
          }),
      })),
    ]);
  };

  return (
    <>
      <Readout>
        <span className="wb-ab-a">{code(a)}</span>
        <span className="pw-faint">L{la.n}</span> {fmtLap(la.time)}
        {lb ? (
          <>
            <span className="pw-faint"> vs </span>
            <span className="wb-ab-b">{code(b)}</span>
            <span className="pw-faint">L{lb.n}</span> {fmtLap(lb.time)}
            <span className="pw-faint"> Δ </span>
            {fmtSigned((lb.time ?? 0) - (la.time ?? 0))}
          </>
        ) : b ? (
          <span className="pw-faint"> · no timed lap for {code(b)}</span>
        ) : null}
        {kWarn ? <span className="wb-warn" title="Lap distance from integrated speed was rescaled by more than 5%."> · scaled ×{kWarn.k.toFixed(2)}</span> : null}
      </Readout>
      <div className="wb-fill" onContextMenu={onMenu} onDoubleClick={() => chart.current?.dispatchAction({ type: "dataZoom", start: 0, end: 100 })}>
        <EChart
          option={option}
          onReady={(c) => {
            chart.current = c;
            setHeight(c.getHeight());
            const zr = c.getZr();
            let drag: number | null = null;
            const toKm = (x: number) => c.convertFromPixel({ xAxisIndex: 0 }, x) as number;
            const inPlot = (x: number) => x >= PAD.left && x <= c.getWidth() - PAD.right;
            zr.on("mousemove", (e) => {
              if (!inPlot(e.offsetX)) return;
              const km = toKm(e.offsetX);
              setHover(km * 1000);
              useWB.setState({ hoverDistance: km * 1000 });
              if (hoverEl.current) {
                hoverEl.current.style.display = "block";
                hoverEl.current.style.transform = `translateX(${e.offsetX}px)`;
              }
              if (drag !== null && boxEl.current) {
                boxEl.current.style.display = "block";
                boxEl.current.style.left = `${Math.min(drag, e.offsetX)}px`;
                boxEl.current.style.width = `${Math.abs(e.offsetX - drag)}px`;
              }
            });
            zr.on("globalout", () => {
              setHover(null);
              useWB.setState({ hoverDistance: null });
              if (hoverEl.current) hoverEl.current.style.display = "none";
            });
            zr.on("mousedown", (e) => {
              if ((e.event as MouseEvent).button === 0 && inPlot(e.offsetX)) drag = e.offsetX;
            });
            zr.on("mouseup", (e) => {
              const start = drag;
              drag = null;
              if (boxEl.current) boxEl.current.style.display = "none";
              if (start === null) return;
              if (Math.abs(e.offsetX - start) > 4) {
                const [k0, k1] = [toKm(start), toKm(e.offsetX)].sort((x, y) => x - y);
                c.dispatchAction({ type: "dataZoom", startValue: k0, endValue: k1 });
              } else {
                const { ta, la } = live.current;
                if (ta && la) setT(la.t0 + interp(ta.d, ta.tau, toKm(e.offsetX) * 1000));
              }
            });
            return () => {
              chart.current = null;
            };
          }}
          onResize={(c) => setHeight(c.getHeight())}
        >
          {grids.map((g) => (
            <div key={g.ch} className="wb-chlabel" style={{ top: g.top, left: PAD.left + 4 }}>
              {CHANNELS[g.ch].label}
              {CHANNELS[g.ch].unit ? <span className="pw-faint"> {CHANNELS[g.ch].unit}</span> : null}
              {hover !== null ? (
                <span className="wb-chlabel__v">
                  {g.ch === "delta" ? (
                    fmt(g.ch, valueAt(ta, g.ch, hover))
                  ) : (
                    <>
                      <span className="wb-ab-a">{fmt(g.ch, valueAt(ta, g.ch, hover))}</span>
                      {tb ? <span className="wb-ab-b">{fmt(g.ch, valueAt(tb, g.ch, hover))}</span> : null}
                    </>
                  )}
                </span>
              ) : null}
            </div>
          ))}
          <div ref={cursorEl} className="wb-vline wb-vline--cursor" style={{ top: PAD.top, bottom: PAD.bottom }} />
          <div ref={hoverEl} className="wb-vline wb-vline--hover" style={{ top: PAD.top, bottom: PAD.bottom }} />
          <div ref={boxEl} className="wb-zoombox" style={{ top: PAD.top, bottom: PAD.bottom }} />
          {hover !== null ? (
            <div className="wb-xread" style={{ left: PAD.left }}>
              {(hover / 1000).toFixed(3)} km
            </div>
          ) : null}
        </EChart>
      </div>
    </>
  );
}

export const trace: PanelDef = {
  type: "trace",
  title: "Trace",
  description: "A's lap against B's by distance, with the running time gap Δ. Drag to zoom, double-click to reset.",
  icon: "chart-line",
  primary: "a",
  slots: {
    a: { schemas: ["rtc.telemetry"], required: true, default: "/vehicle/{A}/telemetry", pattern: true },
    b: { schemas: ["rtc.telemetry"], required: false, default: "/vehicle/{B}/telemetry", pattern: true },
    laps: { schemas: ["rtc.laps"], required: true, default: "/timing/laps" },
    corners: { schemas: ["rtc.track_corners"], required: false, default: "/track/corners" },
    outline: { schemas: ["rtc.track_outline"], required: false, default: "/track/outline" },
  },
  defaultConfig: { x: "distance", channels: ["delta", "speed_kph", "throttle_pct", "brake_pct", "gear"], corners: true },
  settings: [
    {
      key: "corners",
      label: "Corner markers",
      options: [
        { value: true, label: "Show" },
        { value: false, label: "Hide" },
      ],
    },
  ],
  Component: Trace,
};

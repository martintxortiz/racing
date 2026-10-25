"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { interp, poseAt } from "@/lib/workbench/derive";
import { indexAt } from "@/lib/workbench/store";
import { useEntityStyles, usePalette, type EntityStyle, type Palette } from "../colors";
import { EChart, type EChartsInstance, type EChartsOption } from "../EChart";
import { setA, setB, useWB } from "../state";
import { rowMenu } from "./TimingTable";
import { Empty, Readout, Skeleton, useTopicState, type PanelDef, type PanelProps } from "./common";

type Pt = [number, number];
interface Geo {
  outline: Pt[];
  dist: number[];
  corners: { label: string; p: Pt }[];
  rot: (p: Pt) => Pt;
  bounds: [number, number, number, number];
}

/** Rotation that puts the outline's principal axis horizontal. */
function autoAngle(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return -0.5 * Math.atan2(2 * sxy, sxx - syy);
}

function useGeo(outlineTopic: string, cornersTopic: string, rotation: string): Geo | null {
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  return useMemo(() => {
    const o = store.latest<{ x: number[]; y: number[]; distance_m?: number[] }>(outlineTopic);
    if (!o?.x?.length) return null;
    const ang = rotation === "auto" ? autoAngle(o.x, o.y) : (Number(rotation) * Math.PI) / 180;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const rot = ([x, y]: Pt): Pt => [x * c - y * s, x * s + y * c];
    const outline = o.x.map((x, i) => rot([x, o.y[i]]));
    if (outline.length) outline.push(outline[0]);
    const dist = o.distance_m ?? [];
    const corners = (store.get(cornersTopic)?.rows ?? []).map((r) => ({
      label: `${r.number}${r.letter ?? ""}`,
      p: rot([Number(r.x), Number(r.y)]),
    }));
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    return {
      outline,
      dist,
      corners,
      rot,
      bounds: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, outlineTopic, cornersTopic, rotation]);
}

function carData(geo: Geo, styles: Map<string, EntityStyle>, p: Palette, labels: string) {
  const { store, derived, t, a, b, hoverEntity, hoverDistance } = useWB.getState();
  const out: object[] = [];
  for (const e of derived?.entities ?? []) {
    const pose = store.get(`/vehicle/${e.id}/pose`);
    const pos = pose ? poseAt(pose, t) : null;
    if (!pos) continue;
    const role = e.id === a ? "a" : e.id === b ? "b" : null;
    const st = styles.get(e.id);
    const colour = st?.colour ?? p.text3;
    const hover = e.id === hoverEntity;
    out.push({
      value: [...geo.rot(pos), e.id],
      name: e.code,
      symbolSize: role ? 14 : hover ? 13 : 10,
      z: role ? 3 : 2,
      itemStyle: {
        color: st?.second && !role ? p.bg : colour,
        borderColor: role ? (role === "a" ? p.a : p.b) : hover ? p.text1 : colour,
        borderWidth: role || hover ? 2 : st?.second ? 2 : 0,
      },
      label: {
        show: labels === "all" || (labels === "ab" && (role !== null || hover)),
        formatter: e.code,
        position: "right",
        color: role === "a" ? p.a : role === "b" ? p.b : p.text1,
        fontWeight: 600,
        fontSize: 12,
        fontFamily: p.font,
      },
    });
  }
  const hoverPt =
    hoverDistance !== null && geo.dist.length
      ? [geo.outline[Math.round(interp(geo.dist, geo.dist.map((_, i) => i), hoverDistance))]].filter(Boolean)
      : [];
  return { cars: out, hover: hoverPt };
}

function TrackMap({ panel }: PanelProps) {
  const p = usePalette();
  const styles = useEntityStyles();
  const labels = String(panel.config.labels ?? "ab");
  const rotation = String(panel.config.rotation ?? "auto");
  const geo = useGeo(panel.bindings.outline ?? "/track/outline", panel.bindings.corners ?? "/track/corners", rotation);
  const state = useTopicState(panel.bindings.outline ?? "/track/outline");
  const hasPose = useWB((s) => (s.derived?.entities ?? []).some((e) => s.store.get(`/vehicle/${e.id}/pose`)?.length));
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const chart = useRef<EChartsInstance | null>(null);
  const live = useRef({ geo, styles, p, labels });
  useEffect(() => {
    live.current = { geo, styles, p, labels };
  });

  const option = useMemo<EChartsOption>(() => {
    if (!geo) return {};
    // Equal aspect: widen the shorter data range to the panel's aspect ratio.
    const [x0, x1, y0, y1] = geo.bounds;
    const pad = 16;
    const W = Math.max(1, size[0] - 2 * pad);
    const H = Math.max(1, size[1] - 2 * pad);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const scale = Math.min(W / dx, H / dy);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hw = W / scale / 2;
    const hh = H / scale / 2;
    const { cars, hover } = carData(geo, styles, p, labels);
    return {
      animation: false,
      grid: { left: pad, right: pad, top: pad, bottom: pad },
      xAxis: { type: "value", show: false, min: cx - hw, max: cx + hw },
      yAxis: { type: "value", show: false, min: cy - hh, max: cy + hh },
      tooltip: {
        trigger: "item",
        confine: true,
        className: "pw-tooltip",
        borderWidth: 0,
        padding: 0,
        backgroundColor: "transparent",
        extraCssText: "box-shadow:none",
        formatter: (x: { seriesId?: string; value?: unknown[] }) => {
          if (x.seriesId !== "cars" || !Array.isArray(x.value)) return "";
          return carTip(String(x.value[2]));
        },
      },
      series: [
        {
          id: "outline",
          type: "line",
          data: geo.outline,
          showSymbol: false,
          silent: true,
          lineStyle: { color: p.split, width: 5, cap: "round", join: "round" },
          z: 1,
        },
        {
          id: "corners",
          type: "scatter",
          data: geo.corners.map((c) => ({ value: c.p, label: { formatter: c.label } })),
          symbolSize: 0,
          silent: true,
          label: { show: true, color: p.text3, fontSize: 10, fontFamily: p.font, position: "top", distance: 6 },
        },
        { id: "cars", type: "scatter", data: cars, symbol: "circle", z: 3 },
        {
          id: "hover",
          type: "scatter",
          data: hover,
          symbol: "diamond",
          symbolSize: 10,
          silent: true,
          itemStyle: { color: p.text1 },
          z: 4,
        },
      ],
    };
    // carData reads the latest cursor itself; re-run on structure changes only.
  }, [geo, size, p, styles, labels]);

  // Cursor link: update only the cars and hover series, outside React.
  useEffect(() => {
    let raf = 0;
    const unsub = useWB.subscribe((s, prev) => {
      if (s.t === prev.t && s.a === prev.a && s.b === prev.b && s.hoverEntity === prev.hoverEntity &&
        s.hoverDistance === prev.hoverDistance && s.version === prev.version) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { geo, styles, p, labels } = live.current;
        if (!chart.current || !geo) return;
        const { cars, hover } = carData(geo, styles, p, labels);
        chart.current.setOption({ series: [{ id: "cars", data: cars }, { id: "hover", data: hover }] }, { lazyUpdate: true });
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, []);

  if (state === "loading") return <Skeleton rows={6} />;
  if (!geo) return <Empty title="No outline topic">Bind /track/outline from the header.</Empty>;

  return (
    <>
      {!hasPose ? (
        <Readout>
          <span className="pw-faint">No position data</span>
        </Readout>
      ) : null}
      <EChart
        option={option}
        onReady={(c) => {
          chart.current = c;
          setSize([c.getWidth(), c.getHeight()]);
          const click = (e: { seriesId?: string; value?: unknown; event?: { event?: Event } }) => {
            if (e.seriesId !== "cars" || !Array.isArray(e.value)) return;
            const id = String(e.value[2]);
            if ((e.event?.event as MouseEvent | undefined)?.shiftKey) setB(id);
            else setA(id);
          };
          const ctx = (e: { seriesId?: string; value?: unknown; event?: { event?: Event } }) => {
            if (e.seriesId !== "cars" || !Array.isArray(e.value)) return;
            const ev = e.event?.event as MouseEvent | undefined;
            ev?.preventDefault();
            ev?.stopPropagation();
            rowMenu(String(e.value[2]), ev?.clientX ?? 0, ev?.clientY ?? 0);
          };
          const over = (e: { seriesId?: string; value?: unknown }) => {
            if (e.seriesId === "cars" && Array.isArray(e.value)) useWB.setState({ hoverEntity: String(e.value[2]) });
          };
          const out = () => useWB.setState({ hoverEntity: null });
          c.on("click", click);
          c.on("contextmenu", ctx);
          c.on("mouseover", over);
          c.on("mouseout", out);
          return () => {
            chart.current = null;
          };
        }}
        onResize={(c) => {
          const w = c.getWidth();
          const h = c.getHeight();
          setSize((s) => (s[0] === w && s[1] === h ? s : [w, h]));
        }}
      />
    </>
  );
}

function carTip(id: string) {
  const { store, derived, t } = useWB.getState();
  const e = derived?.entityById.get(id);
  const tel = store.get(`/vehicle/${id}/telemetry`);
  let extra = "";
  if (tel) {
    const i = indexAt(tel.t, tel.length, t);
    if (i >= 0) extra = ` · ${Math.round(tel.cols.speed_kph[i])} km/h · G${tel.cols.gear[i]}`;
  }
  return `<div class="pw-tooltip">${e?.code ?? id}${extra}</div>`;
}

export const trackMap: PanelDef = {
  type: "track-map",
  title: "Track map",
  description: "Where every car is at the cursor; the trace hover shows up as a marker.",
  icon: "map",
  primary: "pose",
  slots: {
    outline: { schemas: ["rtc.track_outline"], required: true, default: "/track/outline" },
    corners: { schemas: ["rtc.track_corners"], required: false, default: "/track/corners" },
    pose: { schemas: ["rtc.pose"], required: false, default: "/vehicle/*/pose", pattern: true },
  },
  defaultConfig: { labels: "ab", rotation: "auto" },
  settings: [
    {
      key: "labels",
      label: "Labels",
      options: [
        { value: "ab", label: "A and B" },
        { value: "all", label: "All cars" },
        { value: "none", label: "None" },
      ],
    },
    {
      key: "rotation",
      label: "Rotation",
      options: [
        { value: "auto", label: "Auto" },
        { value: "0", label: "0°" },
        { value: "90", label: "90°" },
        { value: "180", label: "180°" },
        { value: "270", label: "270°" },
      ],
    },
  ],
  Component: TrackMap,
};

"use client";
import { useMemo } from "react";
import { EChart, type EChartsOption } from "@/charts/EChart";
import { axisStyle, useChartTheme } from "@/charts/theme";
import { fmtLap, fmtSigned } from "@/data/format";
import { deltaTrace, traceAt } from "@/derive/trace";
import { sep, type MenuItem } from "@/menus/types";
import { useApp } from "@/state/app";
import { useHover } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { defaultChannels, fieldLabel, fieldTitle, plottable } from "./fields";
import { useSelection, useT } from "./hooks";
import { useSelectionTraces, useTelemetryFields } from "./traces";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./compare.module.css";

export interface CompareConfig {
  channels?: string[];
  delta?: boolean;
  corners?: boolean;
}

const LEFT = 48;
const RIGHT = 14;
const TOP = 8;
const LABEL = 18;
const XAXIS = 22;
const GAP = 6;

function CompareTraces({ session, config, setConfig, width, height }: WidgetProps<CompareConfig>) {
  const t = useT(2);
  const th = useChartTheme();
  const panel = usePanel();
  const sel = useSelection(session, t);
  const hoverD = useHover((s) => s.d);
  const setD = useHover((s) => s.setD);
  const fieldsAvailable = useTelemetryFields(sel.a?.entity ?? null);
  const channels = (config.channels ?? defaultChannels(fieldsAvailable)).filter((f) => fieldsAvailable.includes(f));
  const { a, b, loading } = useSelectionTraces(session, sel, channels);
  const showDelta = config.delta !== false;
  const ta = a?.trace ?? null;
  const tb = b?.trace ?? null;
  const delta = useMemo(() => (ta && tb ? deltaTrace(ta, tb, 5) : null), [ta, tb]);
  const L = session.outline?.length ?? Math.max(ta?.length ?? 0, tb?.length ?? 0);
  const ea = a ? session.entityById.get(a.entity) : undefined;
  const eb = b ? session.entityById.get(b.entity) : undefined;

  const rows = useMemo(() => {
    const list: { key: string; weight: number }[] = [];
    if (showDelta && delta) list.push({ key: "delta", weight: 1.15 });
    for (const c of channels) list.push({ key: c, weight: /gear|brake|drs/.test(c) ? 0.6 : 1 });
    const usable = height - TOP - XAXIS - list.length * (LABEL + GAP);
    const tw = list.reduce((s, r) => s + r.weight, 0) || 1;
    let y = TOP;
    return list.map((r) => {
      const h = Math.max(24, (usable * r.weight) / tw);
      const out = { ...r, labelTop: y, top: y + LABEL, height: h };
      y += LABEL + h + GAP;
      return out;
    });
  }, [showDelta, delta, channels, height]);

  const option = useMemo<EChartsOption>(() => {
    const ax = axisStyle(th);
    const cornerLines = config.corners !== false ? session.corners.map((c) => ({ xAxis: c.d, label: { show: false } })) : [];
    const grids = rows.map((r) => ({ left: LEFT, right: RIGHT, top: r.top, height: r.height }));
    const xAxis = rows.map((_, i) => ({
      type: "value",
      gridIndex: i,
      min: 0,
      max: L || undefined,
      ...ax,
      splitLine: { show: false },
      axisLabel: { ...ax.axisLabel, show: i === rows.length - 1, formatter: (v: number) => `${(v / 1000).toFixed(1)} km` },
      axisLine: { show: i === rows.length - 1, lineStyle: { color: th.line2 } },
    }));
    const yAxis = rows.map((r, i) => {
      const isGear = /^gear/.test(r.key);
      const isPct = /_pct$/.test(r.key);
      return {
        type: "value",
        gridIndex: i,
        scale: r.key === "delta" || /speed|rpm/.test(r.key),
        min: isPct ? 0 : isGear ? 0 : undefined,
        max: isPct ? 100 : isGear ? 8 : undefined,
        splitNumber: r.height < 60 ? 2 : 3,
        interval: isGear ? 4 : undefined,
        ...ax,
        axisLabel: { ...ax.axisLabel, formatter: r.key === "delta" ? (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : undefined },
      };
    });
    const series: unknown[] = [];
    const line = (data: number[][], colour: string, i: number, step = false, extra: object = {}) => ({
      type: "line",
      xAxisIndex: i,
      yAxisIndex: i,
      data,
      showSymbol: false,
      silent: true,
      step: step ? "end" : false,
      lineStyle: { width: 1.4, color: colour },
      sampling: "lttb",
      ...extra,
    });
    rows.forEach((r, i) => {
      const markLine = cornerLines.length
        ? { silent: true, symbol: "none", lineStyle: { color: th.line2, type: "dashed", width: 1 }, label: { show: false }, data: cornerLines }
        : undefined;
      if (r.key === "delta" && delta) {
        const data: number[][] = [];
        for (let k = 0; k < delta.d.length; k++) data.push([delta.d[k], delta.delta[k]]);
        series.push(line(data, th.text, i, false, {
          markLine: { silent: true, symbol: "none", label: { show: false }, data: [{ yAxis: 0, lineStyle: { color: th.line2, type: "solid" } }, ...(markLine?.data ?? [])], lineStyle: { color: th.line2, type: "dashed", width: 1 } },
          areaStyle: { color: th.b, opacity: 0.08, origin: 0 },
        }));
        return;
      }
      const step = /gear|brake|drs/.test(r.key);
      for (const [tr, col] of [[ta, th.a], [tb, th.b]] as const) {
        if (!tr || !tr.ch[r.key]) continue;
        const v = tr.ch[r.key];
        const data: number[][] = [];
        for (let k = 0; k < tr.d.length; k++) if (Number.isFinite(v[k])) data.push([tr.d[k], v[k]]);
        series.push(line(data, col, i, step, col === th.a && markLine ? { markLine } : {}));
      }
    });
    return { grid: grids, xAxis, yAxis, series, tooltip: { show: false } };
  }, [rows, ta, tb, delta, th, L, session.corners, config.corners]);

  const xToD = (x: number) => ((x - LEFT) / (width - LEFT - RIGHT)) * L;
  const dToX = (d: number) => LEFT + (d / (L || 1)) * (width - LEFT - RIGHT);

  const channelMenu = (): MenuItem[] => {
    const avail = plottable(fieldsAvailable);
    return [
      { id: "delta", label: "Delta", checked: showDelta, run: () => setConfig({ delta: !showDelta }) },
      sep,
      ...avail.map((f) => ({
        id: `ch:${f}`,
        label: fieldTitle(f),
        checked: channels.includes(f),
        run: () => setConfig({ channels: channels.includes(f) ? channels.filter((x) => x !== f) : [...channels, f] }),
      })),
      sep,
      { id: "reset", label: "Default channels", run: () => setConfig({ channels: undefined }) },
    ];
  };

  const menu = (e: React.MouseEvent, d: number | null) => {
    const corner = d != null ? session.corners.reduce<(typeof session.corners)[number] | null>((m, c) => (!m || Math.abs(c.d - d) < Math.abs(m.d - d) ? c : m), null) : null;
    openMenu(
      e,
      [
        { kind: "sub", id: "channels", label: "Channels", items: channelMenu() },
        { id: "corners", label: "Corner markers", checked: config.corners !== false, run: () => setConfig({ corners: config.corners === false }) },
        sep,
        { id: "swap", label: "Swap A and B", disabled: !a || !b || sel.auto, run: () => useApp.getState().swapSelection() },
        { id: "best", label: "Use best laps", disabled: sel.auto, run: () => { const s = useApp.getState(); if (s.focus) s.setFocus(s.focus, null); if (s.compare) s.setCompare(s.compare, null); } },
        sep,
        { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
      ],
      d != null ? `${(d / 1000).toFixed(2)} km${corner && Math.abs(corner.d - d) < 120 ? ` · Turn ${corner.number}` : ""}` : undefined,
    );
  };

  const header = (
    <HeaderSlot>
      <span className={css.head}>
        {ea && a && <span><span className={css.ka}>{ea.code}</span> L{a.lap.n} <span className="num">{fmtLap(a.lap.time)}</span></span>}
        {eb && b && <span><span className={css.kb}>{eb.code}</span> L{b.lap.n} <span className="num">{fmtLap(b.lap.time)}</span></span>}
        {sel.auto && <span>top two, right-click a driver to choose</span>}
      </span>
    </HeaderSlot>
  );

  if (!a || !b) {
    return (
      <div className={css.wrap}>
        {header}
        <div className={css.msg}>Choose two drivers: click one, shift-click another, or right-click a row and pick Compare.</div>
      </div>
    );
  }
  if (!ta || !tb) {
    return (
      <div className={css.wrap}>
        {header}
        <div className={css.msg}>{loading ? "Loading telemetry…" : "No telemetry for one of the selected laps."}</div>
      </div>
    );
  }

  const fmtV = (f: string, v: number | null) => (v == null ? "—" : /gear/.test(f) ? v.toFixed(0) : /brake|drs/.test(f) && v <= 1 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
  const cursorD = hoverD != null && hoverD >= 0 && hoverD <= L ? hoverD : null;
  const plotTop = rows[0]?.top ?? 0;
  const last = rows[rows.length - 1];
  const plotBottom = last ? last.top + last.height : 0;

  return (
    <div className={css.wrap} onMouseLeave={() => setD(null)}>
      {header}
      <EChart
        option={option}
        width={width}
        height={height}
        onZr={{
          mousemove: (e) => {
            const d = xToD(e.offsetX);
            setD(d >= 0 && d <= L ? d : null, "compare");
          },
          globalout: () => setD(null),
          contextmenu: (e) => {
            const d = xToD(e.offsetX);
            menu(e.event as unknown as React.MouseEvent, d >= 0 && d <= L ? d : null);
          },
        }}
      />
      {rows.map((r) => {
        const isDelta = r.key === "delta";
        const lbl = isDelta ? null : fieldLabel(r.key);
        const dv = isDelta && cursorD != null && delta ? traceAt({ d: delta.d, tau: delta.delta, ch: {}, length: L }, "tau", cursorD) : null;
        const endDelta = isDelta && delta ? delta.delta[delta.delta.length - 1] : null;
        return (
          <div key={r.key} className={css.label} style={{ top: r.labelTop + 2 }}>
            {isDelta ? (
              <>
                <b>Δ {eb?.code} to {ea?.code} (s)</b>
                <span className="num">{dv != null ? fmtSigned(dv, 3) : `${fmtSigned(endDelta, 3)} at the line`}</span>
                <span>above zero: {ea?.code} ahead</span>
              </>
            ) : (
              <>
                <b>{lbl!.name}{lbl!.unit ? ` (${lbl!.unit})` : ""}</b>
                {cursorD != null && (
                  <>
                    <span className={css.va}>{fmtV(r.key, traceAt(ta, r.key, cursorD))}</span>
                    <span className={css.vb}>{fmtV(r.key, traceAt(tb, r.key, cursorD))}</span>
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
      {cursorD != null && <div className={css.cursor} style={{ left: dToX(cursorD), top: plotTop, height: plotBottom - plotTop }} />}
    </div>
  );
}

export const compareWidget: WidgetDef<CompareConfig> = {
  type: "compare",
  name: "Lap comparison",
  description: "Two laps against distance: delta plus telemetry channels with corner markers",
  group: "Telemetry",
  unavailable: (_s, summary) => (summary.topics.some((t) => /\/telemetry$/.test(t.name)) ? null : "This file has no per-car telemetry topics."),
  Component: CompareTraces,
  menu: ({ config, setConfig }) => [
    { id: "delta", label: "Delta", checked: config.delta !== false, run: () => setConfig({ delta: config.delta === false }) },
    { id: "corners", label: "Corner markers", checked: config.corners !== false, run: () => setConfig({ corners: config.corners === false }) },
  ],
};

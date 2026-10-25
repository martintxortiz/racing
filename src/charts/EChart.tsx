"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, ScatterChart, BarChart, CustomChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, MarkAreaComponent, TooltipComponent, DataZoomComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, ScatterChart, BarChart, CustomChart, GridComponent, MarkLineComponent, MarkAreaComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

export type EChartsOption = echarts.EChartsCoreOption;
export type ECharts = echarts.ECharts;

export interface ZrEvent {
  offsetX: number;
  offsetY: number;
  event: MouseEvent;
  /** Chart element under the pointer, if any. */
  target?: unknown;
}

type Handlers = Partial<Record<"click" | "contextmenu" | "mouseover" | "mouseout", (p: unknown) => void>>;

interface Props {
  option: EChartsOption;
  width: number;
  height: number;
  handlers?: Handlers;
  /** Called with the instance after each option update (overlays use it to convert coords). */
  onReady?: (c: ECharts) => void;
  onZr?: Partial<Record<"mousemove" | "globalout" | "click" | "contextmenu", (e: ZrEvent) => void>>;
  replace?: boolean;
}

/** Thin ECharts wrapper: animation off, sized by the panel, option replaced on change. */
export const EChart = forwardRef<ECharts | null, Props>(function EChart({ option, width, height, handlers, onReady, onZr, replace = true }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const h = useRef({ handlers, onZr, onReady });
  useEffect(() => {
    h.current = { handlers, onZr, onReady };
  });
  useImperativeHandle(ref, () => chart.current as ECharts, []);

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: "canvas" });
    chart.current = c;
    for (const name of ["click", "contextmenu", "mouseover", "mouseout"] as const) c.on(name, (p: unknown) => h.current.handlers?.[name]?.(p));
    const zr = c.getZr();
    for (const name of ["mousemove", "globalout", "click", "contextmenu"] as const) {
      zr.on(name, (e: ZrEvent) => h.current.onZr?.[name]?.(e));
    }
    return () => {
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.setOption({ animation: false, ...option }, { notMerge: replace, lazyUpdate: false });
    h.current.onReady?.(c);
  }, [option, replace]);

  useEffect(() => {
    chart.current?.resize({ width, height });
    if (chart.current) h.current.onReady?.(chart.current);
  }, [width, height]);

  return <div ref={el} style={{ width, height }} />;
});

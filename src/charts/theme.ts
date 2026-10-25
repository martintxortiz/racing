"use client";
import { useMemo } from "react";
import { useApp } from "@/state/app";

export interface ChartTheme {
  text: string;
  text2: string;
  text3: string;
  line: string;
  line2: string;
  panel: string;
  a: string;
  b: string;
  accent: string;
  muted: string;
  sb: string;
  pb: string;
  sc: string;
  red: string;
  band: string;
  mono: string;
  sans: string;
}

const LIGHT: ChartTheme = {
  text: "#161616",
  text2: "#474747",
  text3: "#666666",
  line: "#ececec",
  line2: "#c6c6c6",
  panel: "#ffffff",
  a: "#0f62fe",
  b: "#eb6200",
  accent: "#0f62fe",
  muted: "#b4b4b4",
  sb: "#8a3ffc",
  pb: "#198038",
  sc: "rgba(241, 194, 27, 0.16)",
  red: "rgba(218, 30, 40, 0.1)",
  band: "rgba(0, 0, 0, 0.035)",
  mono: "IBM Plex Mono, ui-monospace, monospace",
  sans: "IBM Plex Sans, system-ui, sans-serif",
};

const DARK: ChartTheme = {
  ...LIGHT,
  text: "#f4f4f4",
  text2: "#c6c6c6",
  text3: "#a0a0a0",
  line: "#2a2a2a",
  line2: "#474747",
  panel: "#161616",
  a: "#78a9ff",
  b: "#ff832b",
  accent: "#78a9ff",
  muted: "#525252",
  sb: "#be95ff",
  pb: "#42be65",
  sc: "rgba(233, 192, 51, 0.13)",
  red: "rgba(224, 67, 75, 0.14)",
  band: "rgba(255, 255, 255, 0.03)",
};

export function useChartTheme(): ChartTheme {
  const theme = useApp((s) => s.theme);
  return useMemo(() => (theme === "dark" ? DARK : LIGHT), [theme]);
}

/** Shared axis styling: thin lines, mono tick labels, no in-chart legends. */
export function axisStyle(th: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: th.line2 } },
    axisTick: { show: false },
    axisLabel: { color: th.text3, fontFamily: th.mono, fontSize: 10.5 },
    splitLine: { lineStyle: { color: th.line } },
    nameTextStyle: { color: th.text3, fontFamily: th.sans, fontSize: 10.5 },
  };
}

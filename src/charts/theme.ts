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
  text: "#15171a",
  text2: "#4e535b",
  text3: "#80868f",
  line: "#e9ebee",
  line2: "#cdd1d7",
  panel: "#ffffff",
  a: "#0f62fe",
  b: "#d9600c",
  accent: "#0f62fe",
  muted: "#b4b9c1",
  sb: "#7a3ee0",
  pb: "#1a8a42",
  sc: "rgba(241, 194, 27, 0.16)",
  red: "rgba(208, 32, 42, 0.1)",
  band: "rgba(16, 24, 40, 0.035)",
  mono: "IBM Plex Mono, ui-monospace, monospace",
  sans: "IBM Plex Sans, system-ui, sans-serif",
};

const DARK: ChartTheme = {
  ...LIGHT,
  text: "#eef0f3",
  text2: "#a7acb4",
  text3: "#6f757e",
  line: "#22252b",
  line2: "#363a42",
  panel: "#15171a",
  a: "#78a9ff",
  b: "#ff9b54",
  accent: "#78a9ff",
  muted: "#4a4f57",
  sb: "#b58cff",
  pb: "#5fd17f",
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

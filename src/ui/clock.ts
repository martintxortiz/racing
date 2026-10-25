import { fmtOffset, fmtTimeOfDay } from "@/data/format";
import type { SessionModel } from "@/derive/model";
import type { ClockMode } from "@/state/app";

export function clockOffset(s: SessionModel, mode: ClockMode, at = Date.now()): number {
  if (mode === "utc") return 0;
  if (mode === "local") return -new Date(at).getTimezoneOffset();
  return s.tzOffsetMin;
}

/** Time of day for a session time, with its zone label. */
export function timeOfDay(s: SessionModel, t: number, mode: ClockMode, seconds = true): { text: string; zone: string } {
  const epoch = s.epoch0 + t;
  const off = clockOffset(s, mode, epoch * 1000);
  return { text: fmtTimeOfDay(epoch, off, seconds), zone: mode === "local" ? "local" : fmtOffset(off) };
}

const STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200];

/** Session times between t0 and t1 that fall on round clock minutes, about `count` of them. */
export function clockTicks(s: SessionModel, t0: number, t1: number, mode: ClockMode, count = 6): number[] {
  const span = Math.max(1, t1 - t0);
  const step = STEPS.find((x) => span / x <= count) ?? 7200;
  const off = clockOffset(s, mode, (s.epoch0 + t0) * 1000) * 60;
  const wall0 = s.epoch0 + t0 + off;
  const first = Math.ceil(wall0 / step) * step;
  const out: number[] = [];
  for (let w = first; w <= wall0 + span; w += step) out.push(w - off - s.epoch0);
  return out;
}

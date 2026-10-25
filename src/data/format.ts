/** Number and time formatting. Minus is U+2212 so signed columns align. */
export const MINUS = "\u2212";
export const DASH = "\u2014";

export function fmtLap(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return DASH;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const r = rest.toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${r}` : rest.toFixed(3);
}

export function fmtSector(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return DASH;
  return s >= 60 ? fmtLap(s) : s.toFixed(3);
}

export function fmtGap(s: number | null | undefined, digits = 3): string {
  if (s == null || !Number.isFinite(s)) return DASH;
  if (Math.abs(s) < 0.0005) return (0).toFixed(digits);
  return (s < 0 ? MINUS : "+") + Math.abs(s).toFixed(digits);
}

export function fmtSigned(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return (v < 0 ? MINUS : v > 0 ? "+" : "") + Math.abs(v).toFixed(digits);
}

/** Clock for durations: 7:41.2 (tenths) or 07:41 / 1:02:03. */
export function fmtClock(sec: number, tenths = false): string {
  const neg = sec < 0;
  let s = Math.abs(sec);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const ss = tenths ? s.toFixed(1).padStart(4, "0") : String(Math.floor(s)).padStart(2, "0");
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
  return (neg ? MINUS : "") + body;
}

/** Time of day for an absolute epoch second, shifted by an offset in minutes. */
export function fmtTimeOfDay(epochSec: number, offsetMin: number, seconds = true): string {
  const d = new Date((epochSec + offsetMin * 60) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return seconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

export function fmtOffset(offsetMin: number): string {
  if (offsetMin === 0) return "UTC";
  const sign = offsetMin < 0 ? MINUS : "+";
  const a = Math.abs(offsetMin);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

/** "08:00:00" or "-04:00:00" -> minutes. */
export function parseOffset(s: string | null | undefined): number {
  if (!s) return 0;
  const m = /^([+-])?(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -v : v;
}

export function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kB`;
  return `${n} B`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return v.toFixed(digits);
}

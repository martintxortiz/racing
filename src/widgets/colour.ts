/** Readable text colour on a team colour fill. */
export function onColour(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.36 ? "#111316" : "#ffffff";
}

/** Team colour toned down slightly so 22 fills do not shout. */
export function teamFill(hex: string, dark: boolean): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // Blend 12% toward the panel colour.
  const [pr, pg, pb] = dark ? [21, 23, 26] : [255, 255, 255];
  const k = 0.12;
  r = Math.round(r * (1 - k) + pr * k);
  g = Math.round(g * (1 - k) + pg * k);
  b = Math.round(b * (1 - k) + pb * k);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export const TYRE: Record<string, { short: string; css: string }> = {
  SOFT: { short: "S", css: "var(--tyre-soft)" },
  MEDIUM: { short: "M", css: "var(--tyre-medium)" },
  HARD: { short: "H", css: "var(--tyre-hard)" },
  INTERMEDIATE: { short: "I", css: "var(--tyre-inter)" },
  WET: { short: "W", css: "var(--tyre-wet)" },
};

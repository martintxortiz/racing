/**
 * When a value earns colour. Everything else stays neutral grey: purple marks a session best,
 * green a personal best, and green/red otherwise only flag a change big enough to matter.
 */
export interface Emphasis {
  /** Gap to the car ahead: tint once it moved by at least this much over the last lap (s). */
  gap: number;
  /** Places gained or lost since the start: tint from this many on. */
  places: number;
}

/** Tone of a change: a meaningful gain, a meaningful loss, or neither. */
export type Change = "good" | "bad" | "none";

export const DEFAULT_EMPHASIS: Emphasis = { gap: 0.3, places: 3 };

/** Green when the gap ahead shrank by `gap` or more over the last lap, red when it grew as much. */
export function gapTrendTone(trend: number | null | undefined, em: Emphasis): Change {
  if (trend == null) return "none";
  return trend <= -em.gap ? "good" : trend >= em.gap ? "bad" : "none";
}

/** Green or red only for a big move in the order; small shuffles stay grey. */
export function placesTone(delta: number, em: Emphasis): Change {
  return delta >= em.places ? "good" : delta <= -em.places ? "bad" : "none";
}

import type { SessionKind } from "@/derive/model";

/** Timing table column widths in px, used to decide what fits. */
export const WIDTH: Record<string, number> = { pos: 38, driver: 80, best: 74, gap: 70, int: 66, last: 100, s1: 56, s2: 56, s3: 56, st: 48, tyre: 54, laps: 44, pits: 40, delta: 44, state: 36 };
/** First dropped first when the panel is narrow. */
const DROP: Record<SessionKind, string[]> = {
  race: ["st", "state", "s3", "s2", "s1", "laps", "delta", "pits", "best", "tyre", "last"],
  qualifying: ["st", "state", "pits", "laps", "tyre", "s3", "s2", "s1", "int", "last"],
  practice: ["st", "state", "pits", "tyre", "s3", "s2", "s1", "int", "laps", "last"],
};

export function fitColumns<T extends { id: string }>(cols: T[], width: number, kind: SessionKind): { cols: T[]; dropped: string[] } {
  let total = 16 + cols.reduce((a, c) => a + (WIDTH[c.id] ?? 50), 0);
  const drop = new Set<string>();
  for (const id of DROP[kind]) {
    if (total <= width) break;
    if (!cols.some((c) => c.id === id)) continue;
    drop.add(id);
    total -= WIDTH[id] ?? 50;
  }
  return { cols: cols.filter((c) => !drop.has(c.id)), dropped: [...drop] };
}

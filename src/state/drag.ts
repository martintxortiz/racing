import { create } from "zustand";
import type { Side } from "@/layout/model";

export type DropZone = Side | "center";

/** Panel drag in progress: what is dragged and where it would land. */
export interface DragState {
  panel: string | null;
  over: { panel: string; zone: DropZone } | { tab: string } | null;
  x: number;
  y: number;
  set: (s: Partial<Omit<DragState, "set">>) => void;
}

export const useDrag = create<DragState>((set) => ({ panel: null, over: null, x: 0, y: 0, set: (s) => set(s) }));

/** Zone for a pointer inside a panel rectangle: edges move, the middle swaps. */
export function zoneFor(r: { left: number; top: number; width: number; height: number }, x: number, y: number): DropZone {
  const fx = (x - r.left) / r.width;
  const fy = (y - r.top) / r.height;
  const edge = 0.26;
  const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
  const [side, dist] = (Object.entries(d) as [Side, number][]).sort((a, b) => a[1] - b[1])[0];
  return dist < edge ? side : "center";
}

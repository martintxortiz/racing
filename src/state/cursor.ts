import { create } from "zustand";

/** Replay clock, kept apart from the main store so 60 fps updates only touch subscribers. */
export interface CursorState {
  t: number;
  playing: boolean;
  speed: number;
  setT: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
}

export const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32, 64, 128];

export const useCursor = create<CursorState>((set) => ({
  t: 0,
  playing: false,
  speed: 1,
  setT: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}));

/** Pointer position shared by distance-based charts and the map. */
export interface HoverState {
  /** Lap distance in metres under the pointer, or null. */
  d: number | null;
  /** Session time under the pointer on time-based charts, or null. */
  t: number | null;
  source: string | null;
  setD: (d: number | null, source?: string | null) => void;
  setHoverT: (t: number | null, source?: string | null) => void;
}

export const useHover = create<HoverState>((set) => ({
  d: null,
  t: null,
  source: null,
  setD: (d, source = null) => set({ d, source }),
  setHoverT: (t, source = null) => set({ t, source }),
}));

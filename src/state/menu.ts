import { create } from "zustand";
import type { MenuItem } from "@/menus/types";

export interface MenuState {
  open: { x: number; y: number; items: MenuItem[]; title?: string } | null;
  show: (x: number, y: number, items: MenuItem[], title?: string) => void;
  close: () => void;
}

export const useMenu = create<MenuState>((set) => ({
  open: null,
  show: (x, y, items, title) => set({ open: { x, y, items, title } }),
  close: () => set({ open: null }),
}));

/** Open a context menu at the pointer. Stops the browser menu and parent handlers. */
export function openMenu(e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, items: MenuItem[], title?: string) {
  e.preventDefault();
  e.stopPropagation();
  useMenu.getState().show(e.clientX, e.clientY, items, title);
}

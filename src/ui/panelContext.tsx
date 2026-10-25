"use client";
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "@/menus/types";

export interface PanelCtx {
  id: string;
  header: HTMLElement | null;
  /** Panel settings + panel actions, for body menus. */
  panelMenu: () => MenuItem[];
}

export const PanelContext = createContext<PanelCtx | null>(null);

export function usePanel(): PanelCtx {
  const c = useContext(PanelContext);
  if (!c) throw new Error("usePanel outside a panel");
  return c;
}

/** Render readouts into the panel header, right of the title. */
export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const c = useContext(PanelContext);
  if (!c?.header) return null;
  return createPortal(children, c.header);
}

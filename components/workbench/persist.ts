"use client";

import { defaultQualiLayout, validateLayout, type Layout } from "@/lib/workbench/layout";
import { loadLayout, useWB } from "./state";

// Layouts live in localStorage under layouts/v1/<id>; _last is the working copy.
const KEY = "layouts/v1/";
const LAST = `${KEY}_last`;

function read(key: string): Layout | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const l = JSON.parse(raw);
    return validateLayout(l) ? null : (l as Layout);
  } catch {
    return null;
  }
}

export function savedLayouts(): Layout[] {
  const out: Layout[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(KEY) && k !== LAST) {
      const l = read(k);
      if (l) out.push(l);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const lastLayout = () => read(LAST);
export const saveLast = (l: Layout) => localStorage.setItem(LAST, JSON.stringify(l));

export function saveLayout(name?: string) {
  const { layout } = useWB.getState();
  const next = name ? { ...layout, name, id: slug(name) } : layout;
  localStorage.setItem(KEY + next.id, JSON.stringify(next));
  useWB.setState({ layout: next, dirty: false });
}

export const deleteSaved = (id: string) => localStorage.removeItem(KEY + id);
export const resetLayout = () => loadLayout(defaultQualiLayout());

export function exportLayout() {
  const { layout } = useWB.getState();
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${layout.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Opens a file dialog; returns an error message or null. */
export function importLayout(onError: (msg: string) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const l = JSON.parse(await f.text());
      const err = validateLayout(l);
      if (err) return onError(`Not a layout: ${err}`);
      loadLayout(l as Layout, true);
    } catch (e) {
      onError(`Could not read ${f.name}: ${e instanceof Error ? e.message : e}`);
    }
  };
  input.click();
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "layout";
}

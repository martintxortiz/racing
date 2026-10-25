import { fmtLap } from "@/data/format";
import type { Entity, Lap } from "@/derive/model";
import type { Side } from "@/layout/model";
import { sep, type MenuItem } from "./types";

export interface PanelMenuCtx {
  tabs: { id: string; name: string }[];
  currentTab: string;
  widgets: { type: string; name: string; group: string }[];
  currentType: string;
  maximized: boolean;
  /** Widget settings, listed first. */
  settings: MenuItem[];
  act: {
    split: (side: Side) => void;
    replace: (type: string) => void;
    moveToTab: (tabId: string) => void;
    moveToNewTab: () => void;
    duplicate: () => void;
    maximize: () => void;
    rename: () => void;
    remove: () => void;
  };
}

export function panelMenu(c: PanelMenuCtx): MenuItem[] {
  const groups = [...new Set(c.widgets.map((w) => w.group))];
  const replace: MenuItem[] = [];
  for (const g of groups) {
    replace.push({ kind: "label", label: g });
    for (const w of c.widgets.filter((x) => x.group === g)) {
      replace.push({ id: `replace:${w.type}`, label: w.name, checked: w.type === c.currentType, run: () => c.act.replace(w.type) });
    }
  }
  return [
    ...c.settings,
    sep,
    { id: "split-right", label: "Split right", run: () => c.act.split("right") },
    { id: "split-down", label: "Split down", run: () => c.act.split("bottom") },
    { kind: "sub", id: "replace", label: "Change widget", items: replace },
    {
      kind: "sub",
      id: "move",
      label: "Move to tab",
      items: [
        ...c.tabs.map((t) => ({ id: `move:${t.id}`, label: t.name, checked: t.id === c.currentTab, disabled: t.id === c.currentTab, run: () => c.act.moveToTab(t.id) })),
        sep,
        { id: "move:new", label: "New tab", run: c.act.moveToNewTab },
      ],
    },
    { id: "duplicate", label: "Duplicate", run: c.act.duplicate },
    { id: "maximize", label: c.maximized ? "Restore size" : "Maximise", hint: "F", run: c.act.maximize },
    { id: "rename", label: "Rename…", run: c.act.rename },
    sep,
    { id: "remove", label: "Remove panel", danger: true, run: c.act.remove },
  ];
}

export interface TabMenuCtx {
  index: number;
  count: number;
  act: {
    rename: () => void;
    duplicate: () => void;
    close: () => void;
    closeOthers: () => void;
    moveLeft: () => void;
    moveRight: () => void;
    addPanel: () => void;
    newTab: () => void;
  };
}

export function tabMenu(c: TabMenuCtx): MenuItem[] {
  return [
    { id: "add-panel", label: "Add panel…", hint: "P", run: c.act.addPanel },
    sep,
    { id: "rename", label: "Rename…", run: c.act.rename },
    { id: "duplicate", label: "Duplicate tab", run: c.act.duplicate },
    { id: "move-left", label: "Move left", disabled: c.index === 0, run: c.act.moveLeft },
    { id: "move-right", label: "Move right", disabled: c.index >= c.count - 1, run: c.act.moveRight },
    sep,
    { id: "new-tab", label: "New tab", run: c.act.newTab },
    { id: "close-others", label: "Close other tabs", disabled: c.count < 2, run: c.act.closeOthers },
    { id: "close", label: "Close tab", danger: true, run: c.act.close },
  ];
}

export interface EntityMenuCtx {
  entity: Entity;
  focus: string | null;
  compare: string | null;
  laps: Lap[];
  bestLap: Lap | null;
  act: {
    focus: (lap: number | null) => void;
    compare: (lap: number | null) => void;
    clearCompare: () => void;
    swap: () => void;
    jump: (t: number) => void;
  };
}

function lapItems(c: EntityMenuCtx, pick: (lap: number | null) => void, prefix: string): MenuItem[] {
  const timed = c.laps.filter((l) => l.time != null);
  const items: MenuItem[] = [{ id: `${prefix}:best`, label: "Personal best", hint: c.bestLap ? fmtLap(c.bestLap.time) : undefined, disabled: !c.bestLap, run: () => pick(null) }];
  if (timed.length) items.push(sep);
  for (const l of timed.slice(-30).reverse()) {
    const tag = l.deleted ? " deleted" : l.pitOut ? " out" : l.pitIn ? " in" : "";
    items.push({ id: `${prefix}:${l.n}`, label: `Lap ${l.n}${tag}`, hint: fmtLap(l.time), run: () => pick(l.n) });
  }
  return items;
}

/** Menu for a driver/vehicle anywhere it appears: rows, chart series, map markers. */
export function entityMenu(c: EntityMenuCtx): MenuItem[] {
  const id = c.entity.id;
  const isA = c.focus === id;
  const isB = c.compare === id;
  const last = [...c.laps].reverse().find((l) => l.t1 != null);
  return [
    { id: "focus", label: "Set as focus (A)", hint: "Click", checked: isA, run: () => c.act.focus(null) },
    { id: "compare", label: c.focus && !isA ? "Compare with focus (B)" : "Set as compare (B)", hint: "Shift+click", checked: isB, run: () => c.act.compare(null) },
    { kind: "sub", id: "focus-lap", label: "Focus on lap", items: lapItems(c, c.act.focus, "fl"), disabled: !c.laps.length },
    { kind: "sub", id: "compare-lap", label: "Compare lap", items: lapItems(c, c.act.compare, "cl"), disabled: !c.laps.length },
    ...(c.focus && c.compare ? [{ id: "swap", label: "Swap A and B", hint: "X", run: c.act.swap } as MenuItem] : []),
    ...(c.compare ? [{ id: "clear", label: "Clear comparison", run: c.act.clearCompare } as MenuItem] : []),
    sep,
    { id: "jump-best", label: "Jump to best lap", disabled: !c.bestLap, run: () => c.bestLap && c.act.jump(c.bestLap.t1 ?? c.bestLap.t0) },
    { id: "jump-last", label: "Jump to last lap", disabled: !last, run: () => last && c.act.jump(last.t1 ?? last.t0) },
  ];
}

export function entityTitle(e: Entity): string {
  return [e.number !== e.code ? `#${e.number}` : null, e.name, e.team].filter(Boolean).join(" · ");
}

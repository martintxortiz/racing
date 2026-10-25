"use client";

import { useRef, useState } from "react";

import { isSplit, panelIds, type Edge, type LayoutNode, type Path } from "@/lib/workbench/layout";
import { HeaderSlot } from "./panels/common";
import { panelDef } from "./panels/registry";
import {
  duplicatePanel,
  movePanelTo,
  openMenu,
  openPicker,
  removePanelById,
  resizeSplit,
  toggleMaximize,
  updatePanel,
  useWB,
  type MenuItem,
} from "./state";

const DRAG_MIME = "application/x-wb-panel";

// ---------- menus ----------

export function emptySpaceMenu(x: number, y: number, tab: string) {
  openMenu(x, y, [
    { label: "Add panel…", hint: "P", onSelect: () => openPicker({ kind: "tab", tab }) },
  ]);
}

function topicItems(id: string): MenuItem[] {
  const { layout, session } = useWB.getState();
  const panel = layout.panels[id];
  const def = panelDef(panel.type);
  const topics = session?.topics ?? [];
  const items: MenuItem[] = [];
  for (const [slot, s] of Object.entries(def.slots)) {
    const cur = panel.bindings[slot];
    const options = new Set<string>();
    if (s.pattern) {
      for (const tp of topics.filter((t) => s.schemas.includes(t.schema))) options.add(tp.name);
      const sample = s.default;
      for (const pat of ["{A}", "{B}", "*"]) options.add(sample.replace(/\{A\}|\{B\}|\*/, pat));
    } else {
      for (const tp of topics.filter((t) => s.schemas.includes(t.schema))) options.add(tp.name);
    }
    if (cur) options.add(cur);
    const sorted = [...options].sort((a, b) => Number(/[{*]/.test(b)) - Number(/[{*]/.test(a)) || a.localeCompare(b, undefined, { numeric: true }));
    items.push({ heading: `${slot}${s.required ? "" : " (optional)"}` });
    // Long entity lists: show patterns + A/B concrete topics only, to keep the menu short.
    const { a, b } = useWB.getState();
    const pinned = (o: string) => /[{*]/.test(o) || o === cur || [a, b].some((e) => e && o.split("/").includes(e));
    const shown = sorted.length > 10 ? sorted.filter(pinned) : sorted;
    for (const o of shown)
      items.push({
        label: o,
        checked: o === cur,
        onSelect: () => updatePanel(id, (p) => ({ ...p, bindings: { ...p.bindings, [slot]: o } })),
      });
    if (!s.required && cur)
      items.push({
        label: "Unbind",
        onSelect: () =>
          updatePanel(id, (p) => {
            const b = { ...p.bindings };
            delete b[slot];
            return { ...p, bindings: b };
          }),
      });
  }
  return items;
}

export function panelMenu(id: string, x: number, y: number, rename?: () => void) {
  const { layout, maximized } = useWB.getState();
  const panel = layout.panels[id];
  if (!panel) return;
  const def = panelDef(panel.type);
  const split = (edge: Edge) => () => openPicker({ kind: "split", panel: id, edge });
  const settings: MenuItem[] = (def.settings ?? []).flatMap((s) => [
    { heading: s.label },
    ...s.options.map((o) => ({
      label: o.label,
      checked: (panel.config[s.key] ?? def.defaultConfig[s.key]) === o.value,
      onSelect: () => updatePanel(id, (p) => ({ ...p, config: { ...p.config, [s.key]: o.value } })),
    })),
  ]);
  openMenu(x, y, [
    { label: "Split right…", onSelect: split("right") },
    { label: "Split down…", onSelect: split("bottom") },
    { label: "Split left…", onSelect: split("left") },
    { label: "Split up…", onSelect: split("top") },
    { label: "Replace with…", onSelect: () => openPicker({ kind: "replace", panel: id }) },
    { separator: true },
    { label: "Duplicate", onSelect: () => duplicatePanel(id) },
    ...(rename ? [{ label: "Rename", onSelect: rename }] : []),
    { label: maximized === id ? "Restore" : "Maximize", hint: "F", onSelect: () => toggleMaximize(id) },
    { label: "Copy panel JSON", onSelect: () => void navigator.clipboard?.writeText(JSON.stringify(panel, null, 2)) },
    ...(settings.length ? [{ separator: true } as const, ...settings] : []),
    { separator: true },
    { label: "Close panel", onSelect: () => removePanelById(id) },
  ]);
}

// ---------- panel frame ----------

function PanelFrame({ id, tab }: { id: string; tab: string }) {
  const panel = useWB((s) => s.layout.panels[id]);
  const maximized = useWB((s) => s.maximized === id);
  const focused = useWB((s) => s.focused === id);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [drop, setDrop] = useState<Edge | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  if (!panel) return null;
  const def = panelDef(panel.type);
  const title = panel.title ?? def.title;
  const topic = def.primary ? panel.bindings[def.primary] : undefined;
  const Component = def.Component;

  const edgeOf = (e: React.DragEvent): Edge => {
    const r = frame.current!.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
    return (Object.keys(d) as Edge[]).reduce((m, k) => (d[k] < d[m] ? k : m), "left");
  };

  return (
    <div
      ref={frame}
      className={`pw-panel wb-panel${focused ? " is-focused" : ""}`}
      data-panel={id}
      onPointerDownCapture={() => useWB.getState().focused !== id && useWB.setState({ focused: id })}
      onContextMenu={(e) => {
        e.preventDefault();
        panelMenu(id, e.clientX, e.clientY, () => setRenaming(true));
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        setDrop(edgeOf(e));
      }}
      onDragLeave={(e) => {
        if (!frame.current?.contains(e.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={(e) => {
        const src = e.dataTransfer.getData(DRAG_MIME);
        setDrop(null);
        if (src && src !== id) movePanelTo(src, id, edgeOf(e));
      }}
    >
      <div
        className="pw-panel__header wb-panel__header"
        draggable={!renaming && !maximized}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          toggleMaximize(id);
        }}
      >
        {renaming ? (
          <input
            className="pw-input wb-rename"
            autoFocus
            defaultValue={title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              updatePanel(id, (p) => ({ ...p, title: v && v !== def.title ? v : undefined }));
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span className="pw-panel__title" title="Drag to move · double-click to maximize">
            {title}
          </span>
        )}
        {topic !== undefined ? (
          <button
            type="button"
            className="wb-topic"
            title="Topic binding"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(r.left, r.bottom + 2, topicItems(id));
            }}
          >
            {topic}
          </button>
        ) : null}
        <span className="pw-panel__meta wb-readout" ref={setSlot} />
        <span className="pw-panel__actions">
          <button
            type="button"
            className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icon"
            aria-label="Panel menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              panelMenu(id, r.right - 180, r.bottom + 2, () => setRenaming(true));
            }}
          >
            <span className="pw-icon pw-icon--overflow-menu-horizontal" />
          </button>
          <button
            type="button"
            className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icon"
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => toggleMaximize(id)}
          >
            <span className={`pw-icon pw-icon--${maximized ? "minimize" : "maximize"}`} />
          </button>
          <button
            type="button"
            className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icon"
            aria-label="Close panel"
            onClick={() => removePanelById(id)}
          >
            <span className="pw-icon pw-icon--close" />
          </button>
        </span>
      </div>
      <div className="pw-panel__body">
        <HeaderSlot.Provider value={slot}>
          <Component
            id={id}
            panel={panel}
            setConfig={(patch) => updatePanel(id, (p) => ({ ...p, config: { ...p.config, ...patch } }))}
          />
        </HeaderSlot.Provider>
      </div>
      {drop ? <div className={`wb-drop wb-drop--${drop}`} /> : null}
      <span hidden data-tab={tab} />
    </div>
  );
}

// ---------- split tree ----------

function Node({ node, path, tab }: { node: LayoutNode; path: Path; tab: string }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!isSplit(node)) return <PanelFrame id={node} tab={tab} />;
  const row = node.direction === "row";
  const pct = node.splitPercentage ?? 50;

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("is-dragging");
    const r = ref.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const v = row ? ((ev.clientX - r.left) / r.width) * 100 : ((ev.clientY - r.top) / r.height) * 100;
      resizeSplit(tab, path, Math.round(v * 10) / 10);
    };
    const up = () => {
      handle.classList.remove("is-dragging");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  return (
    <div ref={ref} className={`pw-split${row ? "" : " pw-split--col"}`}>
      <div className="wb-cell" style={{ flex: `0 0 calc(${pct}% - 0.5px)` }}>
        <Node node={node.first} path={[...path, "first"]} tab={tab} />
      </div>
      <div
        className="pw-split__handle"
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        onPointerDown={onDown}
        onDoubleClick={() => resizeSplit(tab, path, 50)}
      />
      <div className="wb-cell" style={{ flex: "1 1 0" }}>
        <Node node={node.second} path={[...path, "second"]} tab={tab} />
      </div>
    </div>
  );
}

export function TabBody({ tab }: { tab: string }) {
  const root = useWB((s) => s.layout.tabs.find((t) => t.id === tab)?.root ?? null);
  const maximized = useWB((s) => s.maximized);
  if (root === null)
    return (
      <div
        className="pw-empty wb-tab-empty"
        onContextMenu={(e) => {
          e.preventDefault();
          emptySpaceMenu(e.clientX, e.clientY, tab);
        }}
      >
        <div className="pw-empty__title">Empty tab</div>
        <div>Add a panel to start, or right-click anywhere.</div>
        <button type="button" className="pw-btn pw-btn--sm" onClick={() => openPicker({ kind: "tab", tab })}>
          <span className="pw-icon pw-icon--add" /> Add panel
        </button>
      </div>
    );
  if (maximized && panelIds(root).includes(maximized))
    return (
      <div className="pw-split">
        <PanelFrame id={maximized} tab={tab} />
      </div>
    );
  return <Node node={root} path={[]} tab={tab} />;
}

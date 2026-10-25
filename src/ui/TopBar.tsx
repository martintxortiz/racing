"use client";
import { useState } from "react";
import * as L from "@/layout/model";
import { isPreset, PRESETS } from "@/layout/presets";
import { tabMenu } from "@/menus/build";
import { sep, type MenuItem } from "@/menus/types";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { useDrag } from "@/state/drag";
import { Button } from "./controls";
import { ask } from "./Dialogs";
import { IconChevron, IconClose, IconFolder, IconMoon, IconPlus, IconSettings, IconSun } from "./icons";
import { pickFile } from "./files";
import css from "./TopBar.module.css";

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function layoutMenu(): MenuItem[] {
  const st = useApp.getState();
  const cur = st.layout();
  const saved = st.order.filter((id) => !isPreset(id) && st.layouts[id]);
  return [
    { kind: "label", label: "Presets" },
    ...PRESETS.map((p) => ({ id: p.id, label: p.name, checked: st.layoutId === p.id, run: () => st.switchLayout(p.id) })),
    ...(saved.length ? [{ kind: "label", label: "Saved" } as MenuItem, ...saved.map((id) => ({ id, label: st.layouts[id].name, checked: st.layoutId === id, run: () => st.switchLayout(id) }))] : []),
    sep,
    {
      id: "save-as",
      label: "Save as new layout…",
      run: async () => {
        const name = await ask("Save layout as", isPreset(cur.id) ? `${cur.name} (mine)` : `${cur.name} copy`);
        if (name) st.saveLayoutAs(name);
      },
    },
    ...(!isPreset(cur.id)
      ? [
          {
            id: "rename",
            label: "Rename layout…",
            run: async () => {
              const name = await ask("Rename layout", cur.name, "Rename");
              if (name) st.renameLayout(cur.id, name);
            },
          } as MenuItem,
          { id: "delete", label: "Delete layout", danger: true, run: () => st.deleteLayout(cur.id) } as MenuItem,
        ]
      : [{ id: "reset", label: `Reset ${cur.name} to default`, run: () => st.resetLayout(cur.id) } as MenuItem]),
    sep,
    { id: "export", label: "Export layout…", run: () => downloadJson(`${cur.name.replace(/\W+/g, "-").toLowerCase()}.layout.json`, cur) },
    {
      id: "import",
      label: "Import layout…",
      run: async () => {
        const f = await pickFile(".json,application/json");
        if (!f) return;
        try {
          const parsed = L.parseLayout(JSON.parse(await f.text()));
          if (parsed) st.importLayout(parsed);
        } catch {
          // Not JSON: ignore.
        }
      },
    },
  ];
}

function TabButton({ tab, index, count, active }: { tab: L.Tab; index: number; count: number; active: boolean }) {
  const [editing, setEditing] = useState(false);
  const [dropSide, setDropSide] = useState(false);
  const panelOver = useDrag((s) => !!s.over && "tab" in s.over && s.over.tab === tab.id);
  const st = useApp.getState;

  const menu = (e: React.MouseEvent) =>
    openMenu(
      e,
      tabMenu({
        index,
        count,
        act: {
          rename: () => setEditing(true),
          duplicate: () =>
            st().edit((l) => {
              const r = L.duplicateTab(l, tab.id);
              setTimeout(() => st().setTab(r.tabId));
              return r.layout;
            }),
          close: () => st().edit((l) => L.closeTab(l, tab.id)),
          closeOthers: () => st().edit((l) => l.tabs.filter((t) => t.id !== tab.id).reduce((acc, t) => L.closeTab(acc, t.id), l)),
          moveLeft: () => st().edit((l) => L.moveTab(l, index, index - 1)),
          moveRight: () => st().edit((l) => L.moveTab(l, index, index + 1)),
          addPanel: () => {
            st().setTab(tab.id);
            st().openPicker({ tabId: tab.id, target: null, side: "right" });
          },
          newTab: () => st().addTab(),
        },
      }),
      tab.name,
    );

  if (editing) {
    return (
      <input
        className={css.tabInput}
        autoFocus
        defaultValue={tab.name}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          st().edit((l) => L.renameTab(l, tab.id, e.currentTarget.value));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label="Tab name"
      />
    );
  }
  return (
    <div
      className={css.tab}
      role="tab"
      aria-selected={active}
      data-active={active}
      data-tab-id={tab.id}
      data-drop={dropSide || panelOver}
      tabIndex={0}
      draggable
      onClick={() => st().setTab(tab.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && st().setTab(tab.id)}
      onDoubleClick={() => setEditing(true)}
      onContextMenu={menu}
      onAuxClick={(e) => e.button === 1 && st().edit((l) => L.closeTab(l, tab.id))}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-tab", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/x-tab")) {
          e.preventDefault();
          setDropSide(true);
        }
      }}
      onDragLeave={() => setDropSide(false)}
      onDrop={(e) => {
        setDropSide(false);
        const from = Number(e.dataTransfer.getData("text/x-tab"));
        if (Number.isFinite(from)) st().edit((l) => L.moveTab(l, from, index));
      }}
    >
      <span className={css.tabName}>{tab.name}</span>
      <span
        className={css.tabClose}
        role="button"
        aria-label={`Close ${tab.name}`}
        onClick={(e) => {
          e.stopPropagation();
          st().edit((l) => L.closeTab(l, tab.id));
        }}
      >
        <IconClose size={12} />
      </span>
    </div>
  );
}

export function TopBar() {
  const layout = useApp((s) => s.layouts[s.layoutId]);
  const activeId = useApp((s) => s.activeTab[s.layoutId]);
  const theme = useApp((s) => s.theme);
  const status = useApp((s) => s.status);
  const progress = useApp((s) => s.progress);
  const ready = status === "ready";
  const activeTab = layout?.tabs.find((t) => t.id === activeId) ?? layout?.tabs[0];
  const st = useApp.getState;
  const pct = progress && progress.total > 0 ? (progress.loaded / progress.total) * 100 : status === "opening" ? 12 : 0;

  return (
    <header className={css.bar}>
      <div className={css.brand}>
        <span className={css.mark} aria-hidden />
        Racing Workbench
      </div>
      {ready && layout && (
        <nav
          className={css.tabs}
          role="tablist"
          aria-label="Workspace tabs"
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest("[data-tab-id]")) return;
            openMenu(e, [{ id: "new-tab", label: "New tab", run: () => st().addTab() }, ...layoutMenu().length ? [sep, { kind: "sub", id: "layouts", label: "Layout", items: layoutMenu() } as MenuItem] : []]);
          }}
          onDoubleClick={(e) => e.target === e.currentTarget && st().addTab()}
        >
          {layout.tabs.map((t, i) => (
            <TabButton key={t.id} tab={t} index={i} count={layout.tabs.length} active={t.id === activeTab?.id} />
          ))}
          <button className={css.addTab} title="New tab" aria-label="New tab" onClick={() => st().addTab()}>
            <IconPlus size={14} />
          </button>
        </nav>
      )}
      {!ready && <div className={css.tabs} />}
      <div className={css.right}>
        {ready && layout && (
          <>
            <button
              className={css.layoutBtn}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openMenu({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {} }, layoutMenu());
              }}
              aria-label="Layouts"
            >
              <span>Layout</span>
              {layout.name}
              <IconChevron size={14} />
            </button>
            <Button variant="ghost" onClick={() => activeTab && st().openPicker({ tabId: activeTab.id, target: null, side: "right" })} title="Add panel (P)">
              <IconPlus size={14} /> Add panel
            </Button>
            <span className={css.divider} />
          </>
        )}
        <Button variant="ghost" icon onClick={() => st().setTheme(theme === "dark" ? "light" : "dark")} title={theme === "dark" ? "Light theme" : "Dark theme"} aria-label="Toggle theme">
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </Button>
        <Button variant="ghost" icon onClick={() => st().setSettingsOpen(true)} title="Settings" aria-label="Settings">
          <IconSettings />
        </Button>
        <Button
          variant="ghost"
          icon
          title="Open .mcap file"
          aria-label="Open file"
          onClick={async () => {
            const f = await pickFile(".mcap");
            if (f) st().openSource({ file: f, kind: "file" });
          }}
        >
          <IconFolder />
        </Button>
      </div>
      {pct > 0 && status === "opening" && <div className={css.progress} style={{ width: `${pct}%` }} />}
    </header>
  );
}

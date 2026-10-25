"use client";

import { useState } from "react";

import { addTab, deleteTab, duplicateTab, moveTab, openMenu, openPicker, renameTab, setActiveTab, useWB } from "./state";

const MIME = "application/x-wb-tab";

export function TabStrip() {
  const tabs = useWB((s) => s.layout.tabs);
  const active = useWB((s) => s.activeTab);
  const [editing, setEditing] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const menu = (id: string, x: number, y: number) => {
    const i = tabs.findIndex((t) => t.id === id);
    openMenu(x, y, [
      { label: "Rename", onSelect: () => setEditing(id) },
      { label: "Duplicate", onSelect: () => duplicateTab(id) },
      { label: "Add panel…", onSelect: () => openPicker({ kind: "tab", tab: id }) },
      { separator: true },
      { label: "Move left", disabled: i === 0, onSelect: () => moveTab(id, i - 1) },
      { label: "Move right", disabled: i === tabs.length - 1, onSelect: () => moveTab(id, i + 2) },
      { separator: true },
      { label: tabs.length === 1 ? "Clear tab" : "Delete tab", onSelect: () => deleteTab(id) },
    ]);
  };

  return (
    <div
      className="wb-tabstrip"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".pw-tab")) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY, [
          { label: "New tab", onSelect: addTab },
          { label: "Add panel to this tab…", hint: "P", onSelect: () => openPicker({ kind: "tab", tab: active }) },
        ]);
      }}
    >
      <div className="pw-tabs" role="tablist">
        {tabs.map((t, i) => (
          <div
            key={t.id}
            className={`wb-tabwrap${dropAt === i ? " is-drop" : ""}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(MIME)) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
            onDragLeave={() => setDropAt(null)}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(MIME);
              if (id && dropAt !== null) moveTab(id, dropAt);
              setDropAt(null);
            }}
          >
            {editing === t.id ? (
              <input
                className="pw-input wb-rename"
                autoFocus
                defaultValue={t.name}
                onBlur={(e) => {
                  renameTab(t.id, e.target.value);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={t.id === active}
                className={`pw-tab${t.id === active ? " is-active" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(MIME, t.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => setActiveTab(t.id)}
                onDoubleClick={() => setEditing(t.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  menu(t.id, e.clientX, e.clientY);
                }}
              >
                {t.name}
              </button>
            )}
          </div>
        ))}
        {dropAt === tabs.length ? <div className="wb-tabwrap is-drop" /> : null}
      </div>
      <button type="button" className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icon" aria-label="New tab" title="New tab" onClick={addTab}>
        <span className="pw-icon pw-icon--add" />
      </button>
    </div>
  );
}

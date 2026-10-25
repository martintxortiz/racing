"use client";
import { useState } from "react";
import * as L from "@/layout/model";
import { useApp } from "@/state/app";
import { WIDGETS } from "@/widgets";
import { Modal } from "./Dialogs";
import { IconSearch } from "./icons";
import css from "./Picker.module.css";

export function Picker() {
  const picker = useApp((s) => s.picker);
  const session = useApp((s) => s.session);
  const summary = useApp((s) => s.summary);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  if (!picker || !session || !summary) return null;
  const st = useApp.getState();
  const close = () => {
    setQ("");
    setActive(0);
    st.openPicker(null);
  };
  const list = WIDGETS.filter((w) => !q || `${w.name} ${w.description} ${w.group}`.toLowerCase().includes(q.toLowerCase()));
  const add = (type: string) => {
    st.edit((l) => L.addPanel(l, picker.tabId, { type, config: {} }, picker.target, picker.side).layout);
    close();
  };
  const groups = [...new Set(list.map((w) => w.group))];
  const where = picker.target ? `Splits the panel to the ${picker.side === "bottom" ? "bottom" : picker.side}.` : "Adds to the current tab.";
  return (
    <Modal title="Add panel" onClose={close} wide>
      <label className={css.search}>
        <IconSearch size={14} />
        <input
          autoFocus
          placeholder="Search widgets"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(list.length - 1, a + 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            if (e.key === "Enter" && list[active]) add(list[active].type);
          }}
        />
      </label>
      {groups.map((g) => (
        <div key={g}>
          <div className={css.group}>{g}</div>
          <div className={css.grid}>
            {list
              .filter((w) => w.group === g)
              .map((w) => {
                const why = w.unavailable?.(session, summary) ?? null;
                return (
                  <button key={w.type} className={css.item} data-active={list[active]?.type === w.type} onClick={() => add(w.type)} data-widget-option={w.type}>
                    <span className={css.name}>{w.name}</span>
                    <span className={css.desc}>{w.description}</span>
                    {why && <span className={css.why}>{why}</span>}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <div className={css.where}>{where}</div>
    </Modal>
  );
}

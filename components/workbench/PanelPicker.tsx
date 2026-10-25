"use client";

import { useEffect, useRef, useState } from "react";

import { PANELS, newPanelState } from "./panels/registry";
import { addPanel, closePicker, useWB, type PickerTarget } from "./state";

/** Modal list of panel types; arrows + Enter, or click. */
export function PanelPicker() {
  const target = useWB((s) => s.picker);
  return target ? <Picker key={JSON.stringify(target)} target={target} /> : null;
}

function Picker({ target }: { target: PickerTarget }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const list = PANELS.filter((d) => `${d.title} ${d.description}`.toLowerCase().includes(q.toLowerCase()));
  const pick = (i: number) => {
    const d = list[i];
    if (!d) return;
    addPanel(d.type, newPanelState(d), target);
    closePicker();
  };
  const verb =
    target.kind === "replace" ? "Replace panel with" : target.kind === "split" ? `Split ${target.edge} with` : "Add panel";
  return (
    <div className="wb-modal" onPointerDown={(e) => e.target === e.currentTarget && closePicker()}>
      <div
        className="wb-picker"
        role="dialog"
        aria-label={verb}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") closePicker();
          if (e.key === "ArrowDown") setSel((s) => Math.min(list.length - 1, s + 1));
          if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1));
          if (e.key === "Enter") pick(sel);
        }}
      >
        <div className="wb-picker__head">
          <span className="pw-strong">{verb}</span>
          <input
            ref={input}
            className="pw-input"
            placeholder="Search panels"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
          />
        </div>
        <ul className="pw-list">
          {list.map((d, i) => (
            <li
              key={d.type}
              className={`wb-picker__item${i === sel ? " is-active" : ""}`}
              onPointerEnter={() => setSel(i)}
              onClick={() => pick(i)}
            >
              <span className={`pw-icon pw-icon--${d.icon}`} />
              <span>
                <span className="wb-picker__title">{d.title}</span>
                <span className="wb-picker__desc">{d.description}</span>
              </span>
            </li>
          ))}
          {list.length === 0 ? <li className="wb-picker__none">No panel matches “{q}”.</li> : null}
        </ul>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { computeGeometry } from "@/layout/geometry";
import * as L from "@/layout/model";
import { sep } from "@/menus/types";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { Panel } from "./Panel";
import { Button } from "./controls";
import css from "./Mosaic.module.css";

const GUTTER = 4;

export function Mosaic() {
  const tab = useApp((s) => {
    const l = s.layouts[s.layoutId];
    return l?.tabs.find((t) => t.id === s.activeTab[l.id]) ?? l?.tabs[0];
  });
  const maximized = useApp((s) => s.maximized);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!tab) return null;
  const root = maximized && L.contains(tab.root, maximized) ? L.leaf(maximized) : tab.root;
  const { panels, splitters } = computeGeometry(root, { x: GUTTER, y: GUTTER, w: box.w - 2 * GUTTER, h: box.h - 2 * GUTTER }, GUTTER);

  const emptyMenu = (e: React.MouseEvent) => {
    const st = useApp.getState();
    openMenu(e, [
      { id: "add", label: "Add panel…", hint: "P", run: () => st.openPicker({ tabId: tab.id, target: null, side: "right" }) },
      sep,
      { id: "new-tab", label: "New tab", run: () => st.addTab() },
    ]);
  };

  const startResize = (s: (typeof splitters)[number]) => (e: React.PointerEvent) => {
    e.preventDefault();
    const key = s.path.join("");
    setActive(key);
    const rect = ref.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const ratio = s.dir === "row" ? (ev.clientX - rect.left - s.area.x) / s.area.w : (ev.clientY - rect.top - s.area.y) / s.area.h;
      useApp.getState().edit((l) => L.updateTabRoot(l, tab.id, (r) => L.setRatio(r, s.path, ratio)));
    };
    const up = () => {
      setActive(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className={css.mosaic} ref={ref} data-tab={tab.id} data-testid="mosaic">
      {!tab.root && (
        <div className={css.empty} onContextMenu={emptyMenu}>
          <p>This tab is empty</p>
          <Button variant="primary" onClick={() => useApp.getState().openPicker({ tabId: tab.id, target: null, side: "right" })}>
            Add panel
          </Button>
          <span className={css.emptyHint}>Right-click anywhere for more options</span>
        </div>
      )}
      {box.w > 0 &&
        [...panels.entries()].map(([id, r]) => (
          <div key={id} className={css.slot} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
            <Panel id={id} tabId={tab.id} />
          </div>
        ))}
      {!maximized &&
        splitters.map((s) => {
          const key = s.path.join("") || "root";
          const style =
            s.dir === "row"
              ? { left: s.at - GUTTER, top: s.area.y, width: GUTTER * 2, height: s.area.h }
              : { top: s.at - GUTTER, left: s.area.x, height: GUTTER * 2, width: s.area.w };
          return (
            <div
              key={key}
              className={css.splitter}
              data-dir={s.dir}
              data-active={active === s.path.join("")}
              style={style}
              onPointerDown={startResize(s)}
              onDoubleClick={() => useApp.getState().edit((l) => L.updateTabRoot(l, tab.id, (r) => L.setRatio(r, s.path, 0.5)))}
              title="Drag to resize. Double-click to even out."
            />
          );
        })}
    </div>
  );
}

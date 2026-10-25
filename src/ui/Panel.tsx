"use client";
import { PanelBoundary } from "./PanelBoundary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as L from "@/layout/model";
import { panelMenu } from "@/menus/build";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { useDrag, zoneFor } from "@/state/drag";
import { WIDGETS, widgetDef } from "@/widgets";
import { IconMaximize, IconMinimize, IconMore, IconClose } from "./icons";
import { PanelContext } from "./panelContext";
import css from "./Panel.module.css";

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize((s) => (Math.abs(s.width - r.width) < 0.5 && Math.abs(s.height - r.height) < 0.5 ? s : { width: Math.floor(r.width), height: Math.floor(r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function Panel({ id, tabId }: { id: string; tabId: string }) {
  const panel = useApp((s) => s.layouts[s.layoutId]?.panels[id]);
  const session = useApp((s) => s.session);
  const summary = useApp((s) => s.summary);
  const maximized = useApp((s) => s.maximized === id);
  const dragging = useDrag((s) => s.panel === id);
  const over = useDrag((s) => (s.over && "panel" in s.over && s.over.panel === id ? s.over.zone : null));
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const size = useSize(bodyRef);
  const def = panel ? widgetDef(panel.type) : undefined;

  const setConfig = useCallback(
    (patch: Record<string, unknown>) => {
      useApp.getState().edit((l) => {
        const p = l.panels[id];
        return p ? L.updatePanel(l, id, { config: { ...p.config, ...patch } }) : l;
      });
    },
    [id],
  );

  const buildMenu = useCallback(() => {
    const st = useApp.getState();
    const l = st.layout();
    const p = l.panels[id];
    const d = p ? widgetDef(p.type) : undefined;
    const settings = d?.menu && st.session ? d.menu({ config: p!.config, setConfig, session: st.session }) : [];
    return panelMenu({
      tabs: l.tabs.map((t) => ({ id: t.id, name: t.name })),
      currentTab: tabId,
      widgets: WIDGETS.map((w) => ({ type: w.type, name: w.name, group: w.group })),
      currentType: p?.type ?? "",
      maximized: st.maximized === id,
      settings,
      act: {
        split: (side) => st.openPicker({ tabId, target: id, side }),
        replace: (type) => st.edit((x) => L.updatePanel(x, id, { type, config: {}, title: undefined })),
        moveToTab: (t) => st.edit((x) => L.movePanelToTab(x, id, t)),
        moveToNewTab: () => {
          const t = st.addTab();
          st.edit((x) => L.movePanelToTab(x, id, t));
        },
        duplicate: () =>
          st.edit((x) => {
            const src = x.panels[id];
            return src ? L.addPanel(x, tabId, { type: src.type, title: src.title, config: structuredClone(src.config) }, id, "right").layout : x;
          }),
        maximize: () => st.setMaximized(st.maximized === id ? null : id),
        rename: () => setRenaming(true),
        remove: () => st.edit((x) => L.closePanel(x, id)),
      },
    });
  }, [id, tabId, setConfig]);

  const ctx = useMemo(() => ({ id, header, panelMenu: buildMenu }), [id, header, buildMenu]);

  // Drag the header to swap or re-dock the panel.
  const onHeaderDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button,input")) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      started = true;
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const tabEl = el?.closest<HTMLElement>("[data-tab-id]");
      const panelEl = el?.closest<HTMLElement>("[data-panel-id]");
      let over: ReturnType<typeof useDrag.getState>["over"] = null;
      if (tabEl && tabEl.dataset.tabId !== tabId) over = { tab: tabEl.dataset.tabId! };
      else if (panelEl && panelEl.dataset.panelId !== id) over = { panel: panelEl.dataset.panelId!, zone: zoneFor(panelEl.getBoundingClientRect(), ev.clientX, ev.clientY) };
      useDrag.getState().set({ panel: id, over, x: ev.clientX, y: ev.clientY });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const { over } = useDrag.getState();
      useDrag.getState().set({ panel: null, over: null });
      if (!started || !over) return;
      const st = useApp.getState();
      if ("tab" in over) st.edit((l) => L.movePanelToTab(l, id, over.tab));
      else if (over.zone === "center") st.edit((l) => L.updateTabRoot(l, tabId, (r) => L.swapPanels(r, id, over.panel)));
      else st.edit((l) => L.updateTabRoot(l, tabId, (r) => L.movePanel(r, id, over.panel, over.zone as L.Side)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!panel) return null;
  const title = panel.title || def?.name || panel.type;
  const reason = def && session && summary && def.unavailable ? def.unavailable(session, summary) : null;
  const Comp = def?.Component;

  return (
    <PanelContext.Provider value={ctx}>
      <section className={`${css.panel} ${dragging ? css.dragging : ""}`} data-panel-id={id} data-widget={panel.type} aria-label={title}>
        <div className={css.header} onPointerDown={onHeaderDown} onContextMenu={(e) => openMenu(e, buildMenu(), title)} onDoubleClick={(e) => (e.target as HTMLElement).dataset.title && setRenaming(true)}>
          {renaming ? (
            <input
              className={css.rename}
              autoFocus
              defaultValue={title}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                useApp.getState().edit((l) => L.updatePanel(l, id, { title: v && v !== def?.name ? v : undefined }));
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <span className={css.title} data-title="1" title={def?.description}>
              {title}
            </span>
          )}
          <div className={css.slot} ref={setHeader} />
          <div className={css.tools}>
            <button className={css.tool} title={maximized ? "Restore" : "Maximise"} onClick={() => useApp.getState().setMaximized(maximized ? null : id)}>
              {maximized ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
            </button>
            <button
              className={css.tool}
              title="Panel menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openMenu({ clientX: r.right - 200, clientY: r.bottom + 2, preventDefault() {}, stopPropagation() {} }, buildMenu(), title);
              }}
            >
              <IconMore size={14} />
            </button>
            <button className={css.tool} title="Remove panel" onClick={() => useApp.getState().edit((l) => L.closePanel(l, id))}>
              <IconClose size={14} />
            </button>
          </div>
        </div>
        <div className={css.body} ref={bodyRef} onContextMenu={(e) => openMenu(e, buildMenu(), title)}>
          {!def && <div className={css.unavailable}>Unknown widget “{panel.type}”. Change it from the panel menu.</div>}
          {reason && <div className={css.unavailable}>{reason}</div>}
          {Comp && session && !reason && size.width > 0 && (
            <PanelBoundary resetKey={`${panel.type}:${session.fileName}`}>
              <Comp panelId={id} config={panel.config} setConfig={setConfig} session={session} width={size.width} height={size.height} />
            </PanelBoundary>
          )}
        </div>
        {over && <DropHint zone={over} />}
      </section>
    </PanelContext.Provider>
  );
}

function DropHint({ zone }: { zone: string }) {
  const s: React.CSSProperties = { inset: 4 };
  if (zone === "left") Object.assign(s, { right: "50%" });
  if (zone === "right") Object.assign(s, { left: "50%" });
  if (zone === "top") Object.assign(s, { bottom: "50%" });
  if (zone === "bottom") Object.assign(s, { top: "50%" });
  return <div className={css.drop} style={s} />;
}

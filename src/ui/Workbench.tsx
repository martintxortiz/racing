"use client";
import { useEffect, useState } from "react";
import { hydrateWorkspace, useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";
import { useMenu } from "@/state/menu";
import { ContextMenu } from "./ContextMenu";
import { Dialogs } from "./Dialogs";
import { EmptyState, OpeningStrip } from "./EmptyState";
import { SAMPLE_URL } from "./files";
import { specFromParams } from "@/data/source";
import { SessionPicker } from "./SessionPicker";
import { Mosaic } from "./Mosaic";
import { Picker } from "./Picker";
import { TopBar } from "./TopBar";
import { Transport, stepLap, usePlayback } from "./Transport";
import emptyCss from "./Empty.module.css";
import css from "./Workbench.module.css";

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function useUrlSync() {
  const status = useApp((s) => s.status);
  useEffect(() => {
    if (status !== "ready") return;
    // Restore the tab from the address once per file.
    const params = new URLSearchParams(window.location.search);
    const want = params.get("tab");
    if (want) {
      const st = useApp.getState();
      const tab = st.layout().tabs.find((t) => slug(t.name) === slug(want) || t.id === want);
      if (tab) st.setTab(tab.id);
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const write = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const st = useApp.getState();
        if (st.status !== "ready") return;
        const p = new URLSearchParams(window.location.search);
        p.set("layout", slug(st.layouts[st.layoutId]?.name ?? ""));
        p.set("tab", slug(st.tab().name));
        p.set("t", useCursor.getState().t.toFixed(1));
        const next = `${window.location.pathname}?${p.toString().replace(/%2F/g, "/").replace(/%3A/g, ":")}`;
        window.history.replaceState(null, "", next);
      }, 400);
    };
    write();
    const a = useCursor.subscribe(write);
    const b = useApp.subscribe((s, prev) => (s.activeTab !== prev.activeTab || s.layoutId !== prev.layoutId) && write());
    return () => {
      a();
      b();
      if (timer) clearTimeout(timer);
    };
  }, [status]);
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || useMenu.getState().open) return;
      const st = useApp.getState();
      if (st.status !== "ready" || st.picker || st.settingsOpen || st.sessionPickerOpen) return;
      const c = useCursor.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === " ") {
        e.preventDefault();
        c.setPlaying(!c.playing);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const d = (e.shiftKey ? 30 : 5) * (e.key === "ArrowRight" ? 1 : -1);
        c.setT(c.t + d);
      } else if (e.key === "]") stepLap(1);
      else if (e.key === "[") stepLap(-1);
      else if (e.key === "x" && !mod) st.swapSelection();
      else if (e.key === "Escape") {
        if (st.maximized) st.setMaximized(null);
        else st.setCompare(null);
      } else if (e.key === "p" && !mod) {
        e.preventDefault();
        st.openPicker({ tabId: st.tab().id, target: null, side: "right" });
      } else if (e.key === "t" && !mod) st.addTab();
      else if (/^[1-9]$/.test(e.key) && !mod) {
        const tab = st.layout().tabs[Number(e.key) - 1];
        if (tab) st.setTab(tab.id);
      } else if (e.key === "f" && !mod) {
        const hovered = document.querySelector("[data-panel-id]:hover") as HTMLElement | null;
        const id = hovered?.dataset.panelId ?? null;
        st.setMaximized(st.maximized ? null : id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function Workbench() {
  const status = useApp((s) => s.status);
  const theme = useApp((s) => s.theme);
  const hydrated = useApp((s) => s.hydrated);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    hydrateWorkspace();
    // ?src=<url> opens a file, ?api=<id>[&live=1] streams from the session server. Nothing named:
    // open the sample straight away, so the first screen is the Monitor tab, not a picker.
    const spec = specFromParams(new URLSearchParams(window.location.search), window.location.href);
    useApp.getState().openSource(spec ?? { url: SAMPLE_URL, name: "Sample session", kind: "sample" });
  }, []);
  useEffect(() => {
    if (hydrated) document.documentElement.dataset.theme = theme;
  }, [theme, hydrated]);

  usePlayback();
  useUrlSync();
  useShortcuts();

  // Drop a file anywhere to open it.
  useEffect(() => {
    let depth = 0;
    const hasFile = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth++;
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const over = (e: DragEvent) => hasFile(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      const f = e.dataTransfer?.files[0];
      if (f) useApp.getState().openSource({ file: f, kind: "file" });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div className={css.app} data-status={status}>
      <TopBar />
      {status === "ready" || (status === "opening" && hydrated) ? (
        <>
          {/* While a file opens, the tab's panels are already in place and fill in when it is read. */}
          <Mosaic />
          {status === "ready" ? <Transport /> : <OpeningStrip />}
        </>
      ) : (
        hydrated && <EmptyState />
      )}
      <ContextMenu />
      <Picker />
      <SessionPicker />
      <Dialogs />
      {dropping && status === "ready" && <div className={emptyCss.dropOverlay}>Drop to open the file</div>}
    </div>
  );
}

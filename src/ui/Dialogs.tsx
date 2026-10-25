"use client";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useApp, type ClockMode } from "@/state/app";
import { Button, Segmented } from "./controls";
import { IconClose } from "./icons";
import css from "./Dialog.module.css";

interface PromptState {
  open: { id: number; title: string; value: string; action: string; resolve: (v: string | null) => void } | null;
}
const usePrompt = create<PromptState>(() => ({ open: null }));

/** Ask for a short text value (names). Resolves null on cancel. */
let promptId = 0;
export function ask(title: string, value = "", action = "Save"): Promise<string | null> {
  return new Promise((resolve) => usePrompt.setState({ open: { id: ++promptId, title, value, action, resolve } }));
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className={css.scrim} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${css.dialog} ${wide ? css.wide : ""}`} role="dialog" aria-label={title}>
        <div className={css.head}>
          {title}
          <Button variant="ghost" icon onClick={onClose} aria-label="Close">
            <IconClose size={14} />
          </Button>
        </div>
        <div className={css.body}>{children}</div>
        {footer && <div className={css.foot}>{footer}</div>}
      </div>
    </div>
  );
}

function PromptDialog() {
  const open = usePrompt((s) => s.open);
  if (!open) return null;
  return <PromptBody key={open.id} open={open} />;
}

function PromptBody({ open }: { open: NonNullable<PromptState["open"]> }) {
  const [v, setV] = useState(open.value);
  const done = (val: string | null) => {
    usePrompt.setState({ open: null });
    open.resolve(val);
  };
  return (
    <Modal
      title={open.title}
      onClose={() => done(null)}
      footer={
        <>
          <Button onClick={() => done(null)}>Cancel</Button>
          <Button variant="primary" disabled={!v.trim()} onClick={() => done(v.trim())}>
            {open.action}
          </Button>
        </>
      }
    >
      <input className={css.input} autoFocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => e.key === "Enter" && v.trim() && done(v.trim())} />
    </Modal>
  );
}

function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen);
  const settings = useApp((s) => s.settings);
  const theme = useApp((s) => s.theme);
  if (!open) return null;
  const st = useApp.getState();
  return (
    <Modal title="Settings" onClose={() => st.setSettingsOpen(false)}>
      <div className={css.field}>
        <span className={css.fieldLabel}>Theme</span>
        <Segmented label="Theme" value={theme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(t) => st.setTheme(t)} />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>
          Time of day
          <small>Used in the transport bar and event log</small>
        </span>
        <Segmented<ClockMode>
          label="Time of day"
          value={settings.clock}
          options={[
            { value: "track", label: "Track" },
            { value: "local", label: "Local" },
            { value: "utc", label: "UTC" },
          ]}
          onChange={(clock) => st.setSettings({ clock })}
        />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>
          Replay range
          <small>The session window skips pre-session recording</small>
        </span>
        <Segmented
          label="Replay range"
          value={settings.fullRecording ? "full" : "session"}
          options={[
            { value: "session", label: "Session" },
            { value: "full", label: "Full recording" },
          ]}
          onChange={(v) => st.setSettings({ fullRecording: v === "full" })}
        />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>
          Layout on open
          <small>Pick the preset that matches the session type</small>
        </span>
        <Segmented
          label="Layout on open"
          value={settings.autoLayout ? "auto" : "keep"}
          options={[
            { value: "auto", label: "Match session" },
            { value: "keep", label: "Keep current" },
          ]}
          onChange={(v) => st.setSettings({ autoLayout: v === "auto" })}
        />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>
          Highlight gap changes
          <small>Gap ahead turns green or red when it moved this much over a lap</small>
        </span>
        <Segmented
          label="Highlight gap changes"
          value={String(settings.emphasis.gap)}
          options={["0.1", "0.3", "0.5", "1"].map((v) => ({ value: v, label: `${v} s` }))}
          onChange={(v) => st.setSettings({ emphasis: { ...settings.emphasis, gap: Number(v) } })}
        />
      </div>
      <div className={css.field}>
        <span className={css.fieldLabel}>
          Highlight places gained
          <small>+/− turns green or red from this many places</small>
        </span>
        <Segmented
          label="Highlight places gained"
          value={String(settings.emphasis.places)}
          options={["1", "3", "5"].map((v) => ({ value: v, label: v }))}
          onChange={(v) => st.setSettings({ emphasis: { ...settings.emphasis, places: Number(v) } })}
        />
      </div>
    </Modal>
  );
}

export function Dialogs() {
  return (
    <>
      <PromptDialog />
      <SettingsDialog />
    </>
  );
}

export const dialogCss = css;

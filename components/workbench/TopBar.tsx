"use client";

import { useMemo } from "react";

import { segmentClock, timeOfDay } from "@/lib/workbench/format";
import { indexAt } from "@/lib/workbench/store";
import { useEntityStyles } from "./colors";
import { useThrottledT } from "./panels/common";
import { deleteSaved, exportLayout, importLayout, resetLayout, saveLayout, savedLayouts } from "./persist";
import { loadLayout, notify, openMenu, setA, setB, swapAB, useWB, type MenuItem } from "./state";

const at = (e: React.MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return [r.left, r.bottom + 2] as const;
};

export function layoutMenu(x: number, y: number) {
  const { layout, dirty } = useWB.getState();
  const saved = savedLayouts();
  openMenu(x, y, [
    { heading: `${layout.name}${dirty ? " (edited)" : ""}` },
    { label: "Save", hint: "⌘S", onSelect: () => (saveLayout(), notify(`Saved “${useWB.getState().layout.name}”`)) },
    {
      label: "Save as…",
      onSelect: () =>
        useWB.setState({
          prompt: { title: "Save layout as", value: `${layout.name} copy`, onSubmit: (v) => (saveLayout(v), notify(`Saved “${v}”`)) },
        }),
    },
    { label: "Reset to default", onSelect: resetLayout },
    { separator: true },
    { label: "Import JSON…", onSelect: () => importLayout((m) => notify(m, "error")) },
    { label: "Export JSON", onSelect: exportLayout },
    ...(saved.length
      ? [
          { separator: true } as const,
          { heading: "Saved layouts" },
          ...saved.flatMap((l): MenuItem[] => [
            { label: l.name, checked: l.id === layout.id, onSelect: () => loadLayout(l) },
          ]),
          {
            label: "Delete current from saved",
            disabled: !saved.some((l) => l.id === layout.id),
            onSelect: () => (deleteSaved(layout.id), notify(`Deleted “${layout.name}”`)),
          },
        ]
      : []),
  ]);
}

function driverMenu(role: "A" | "B", x: number, y: number) {
  const { derived, a, b } = useWB.getState();
  const cur = role === "A" ? a : b;
  const pick = role === "A" ? setA : setB;
  openMenu(x, y, [
    { heading: `Driver ${role}` },
    ...(derived?.entities ?? []).map((e) => ({
      label: `${e.code}  ${e.number ?? ""}  ${e.team ?? ""}`,
      checked: e.id === cur,
      onSelect: () => pick(e.id),
    })),
    ...(role === "B" ? [{ separator: true } as const, { label: "Clear B", disabled: !b, onSelect: () => setB(null) }] : []),
  ]);
}

function Weather() {
  const store = useWB((s) => s.store);
  const version = useWB((s) => s.version);
  const t = useThrottledT(1);
  const w = useMemo(() => {
    const d = store.get("/session/weather");
    if (!d) return null;
    const i = indexAt(d.t, d.length, t);
    return (d.rows[Math.max(0, i)] ?? null) as Record<string, number> | null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, t]);
  if (!w) return null;
  return (
    <span className="wb-weather" title={`Humidity ${w.humidity_pct ?? "—"}%`}>
      <span className="pw-icon pw-icon--temperature" />
      <span>
        Air <b>{w.air_temperature_c?.toFixed(1)}°</b> Track <b>{w.track_temperature_c?.toFixed(1)}°</b>
      </span>
      <span className="pw-icon pw-icon--wind-gusts" />
      <span>
        <b>{w.wind_speed_mps?.toFixed(1)}</b> m/s
      </span>
      {w.rainfall ? (
        <>
          <span className="pw-icon pw-icon--rain-drop" /> Rain
        </>
      ) : null}
    </span>
  );
}

function Clock() {
  const t = useThrottledT(10);
  const session = useWB((s) => s.session);
  const derived = useWB((s) => s.derived);
  if (!session) return null;
  return (
    <span className="wb-clock">
      <b>{segmentClock(t, derived?.segments ?? [], session.session)}</b>
      <span className="pw-faint">{timeOfDay(t, session.startNs, session.utcOffsetSec)}</span>
    </span>
  );
}

export function TopBar() {
  const session = useWB((s) => s.session);
  const derived = useWB((s) => s.derived);
  const a = useWB((s) => s.a);
  const b = useWB((s) => s.b);
  const theme = useWB((s) => s.theme);
  const dirty = useWB((s) => s.dirty);
  const layoutName = useWB((s) => s.layout.name);
  const styles = useEntityStyles();
  const ent = (id: string | null) => (id ? derived?.entityById.get(id) : undefined);

  const chip = (role: "A" | "B", id: string | null) => (
    <button
      type="button"
      className={`wb-chip wb-chip--${role.toLowerCase()}`}
      title={`Driver ${role} · click to change`}
      onClick={(e) => driverMenu(role, ...at(e))}
    >
      <span className="wb-chip__role">{role}</span>
      {id ? (
        <>
          <i className="pw-team" style={{ ["--c" as string]: styles.get(id)?.colour }} />
          <b>{ent(id)?.code ?? id}</b>
        </>
      ) : (
        <span className="pw-faint">none</span>
      )}
    </button>
  );

  return (
    <header className="pw-topbar wb-topbar">
      <span className="wb-title">
        <b>{session?.title ?? "Workbench"}</b>
        {session ? <span className="pw-faint">{session.venue}</span> : null}
      </span>
      <span className="pw-topbar__meta">
        <Clock />
        <Weather />
      </span>
      <span className="pw-spacer" />
      <span className="wb-ab">
        {chip("A", a)}
        <button type="button" className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icon" aria-label="Swap A and B" title="Swap A/B (X)" onClick={swapAB}>
          <span className="pw-icon pw-icon--arrows-vertical wb-rot90" />
        </button>
        {chip("B", b)}
      </span>
      <span className="pw-topbar__actions">
        <button type="button" className="pw-btn pw-btn--ghost pw-btn--sm" onClick={(e) => layoutMenu(...at(e))} title="Layout">
          <span className="pw-icon pw-icon--grid" />
          {layoutName}
          {dirty ? <span className="pw-faint">•</span> : null}
        </button>
        {session?.notes.length ? (
          <button
            type="button"
            className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icon"
            aria-label="Data notes"
            title="Data notes"
            onClick={(e) => openMenu(...at(e), [{ heading: "Data notes" }, ...session.notes.map((n) => ({ label: n, onSelect: () => {} }))])}
          >
            <span className="pw-icon pw-icon--information" />
          </button>
        ) : null}
        <button
          type="button"
          className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icon"
          aria-label="Toggle theme"
          title={`${theme === "dark" ? "Light" : "Dark"} theme`}
          onClick={() => window.dispatchEvent(new CustomEvent("wb:theme", { detail: theme === "dark" ? "light" : "dark" }))}
        >
          <span className={`pw-icon pw-icon--${theme === "dark" ? "light" : "asleep"}`} />
        </button>
      </span>
    </header>
  );
}

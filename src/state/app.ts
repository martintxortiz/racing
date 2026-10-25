import { create } from "zustand";
import type { Columns, FileSummary } from "@/data/types";
import type { Progress } from "@/data/client";
import { createSource, type DataSource, type SourceKind, type SourceSpec } from "@/data/source";
import type { StreamUpdate } from "@/data/stream";
import type { SessionModel } from "@/derive/model";
import { buildSession } from "@/derive/session";
import { resolveTopics, type TopicMap } from "@/derive/topics";
import * as L from "@/layout/model";
import { buildPreset, isPreset, presetFor, PRESET_REV, PRESETS } from "@/layout/presets";
import { DEFAULT_EMPHASIS, type Emphasis } from "@/widgets/emphasis";
import { useCursor } from "./cursor";

export type Theme = "light" | "dark";
export type ClockMode = "track" | "utc" | "local";

export interface Settings {
  clock: ClockMode;
  /** Scrub the whole recording instead of the session window. */
  fullRecording: boolean;
  /** Pick a layout matching the session type when a file opens. */
  autoLayout: boolean;
  /** Thresholds for green/red highlights. */
  emphasis: Emphasis;
}

export interface Source {
  kind: SourceKind;
  name: string;
  url?: string;
  /** Server session id for "replay" and "live". */
  id?: string;
}

/** Following a live stream: the newest data time, and whether the cursor sticks to it. */
export interface LiveState {
  head: number;
  following: boolean;
}

export interface AppState {
  status: "empty" | "opening" | "ready" | "error";
  error: string | null;
  progress: Progress | null;
  source: Source | null;
  summary: FileSummary | null;
  topicMap: TopicMap | null;
  session: SessionModel | null;
  topics: Record<string, Columns>;
  loading: Record<string, true>;
  /** Set while a live stream is open. */
  live: LiveState | null;
  /** A server stream dropped (shown in the transport). */
  streamError: string | null;
  sessionPickerOpen: boolean;

  focus: string | null;
  compare: string | null;
  /** Lap numbers chosen for focus and compare; null means personal best. */
  focusLap: number | null;
  compareLap: number | null;

  layouts: Record<string, L.Layout>;
  order: string[];
  layoutId: string;
  activeTab: Record<string, string>;
  maximized: string | null;
  picker: { tabId: string; target: string | null; side: L.Side; replace?: string } | null;
  settingsOpen: boolean;
  /** Workspace restored from localStorage (client only). */
  hydrated: boolean;
  theme: Theme;
  settings: Settings;

  openSource: (src: SourceSpec) => Promise<void>;
  setFollowing: (f: boolean) => void;
  setSessionPickerOpen: (o: boolean) => void;
  closeFile: () => void;
  ensureTopics: (topics: string[]) => void;

  setFocus: (id: string | null, lap?: number | null) => void;
  setCompare: (id: string | null, lap?: number | null) => void;
  swapSelection: () => void;

  layout: () => L.Layout;
  tab: () => L.Tab;
  edit: (fn: (l: L.Layout) => L.Layout) => void;
  setTab: (tabId: string) => void;
  addTab: (name?: string) => string;
  switchLayout: (id: string) => void;
  saveLayoutAs: (name: string) => string;
  renameLayout: (id: string, name: string) => void;
  deleteLayout: (id: string) => void;
  resetLayout: (id: string) => void;
  importLayout: (l: L.Layout) => void;
  setMaximized: (id: string | null) => void;
  openPicker: (p: AppState["picker"]) => void;
  setTheme: (t: Theme) => void;
  setSettings: (s: Partial<Settings>) => void;
  setSettingsOpen: (o: boolean) => void;
}

const STORE_KEY = "racing.workspace.v1";

interface Persisted {
  layouts: Record<string, L.Layout>;
  order: string[];
  layoutId: string;
  activeTab: Record<string, string>;
  theme: Theme;
  settings: Settings;
}

function initialWorkspace(): Persisted {
  const layouts: Record<string, L.Layout> = {};
  for (const p of PRESETS) layouts[p.id] = buildPreset(p.id);
  // The bundled sample is a race, so a first visit opens on the Race preset's Monitor tab.
  const layoutId = presetFor("race").id;
  return {
    layouts,
    order: PRESETS.map((p) => p.id),
    layoutId,
    activeTab: Object.fromEntries(Object.values(layouts).map((l) => [l.id, l.tabs[0].id])),
    theme: "light",
    settings: { clock: "track", fullRecording: false, autoLayout: true, emphasis: DEFAULT_EMPHASIS },
  };
}

function loadPersisted(): Persisted {
  const base = initialWorkspace();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) {
      base.theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      return base;
    }
    const p = JSON.parse(raw) as Partial<Persisted>;
    const layouts: Record<string, L.Layout> = { ...base.layouts };
    const stale = new Set<string>();
    for (const [id, l] of Object.entries(p.layouts ?? {})) {
      const parsed = L.parseLayout(l);
      // Built-in layouts saved from an older preset revision are rebuilt so new tabs appear.
      if (parsed && isPreset(id) && (parsed.rev ?? 1) < PRESET_REV) {
        stale.add(id);
        continue;
      }
      if (parsed) layouts[id] = { ...parsed, id };
    }
    const order = [...new Set([...(p.order ?? []).filter((id) => layouts[id]), ...Object.keys(layouts)])];
    const layoutId = p.layoutId && layouts[p.layoutId] ? p.layoutId : base.layoutId;
    return {
      layouts,
      order,
      layoutId,
      activeTab: { ...base.activeTab, ...Object.fromEntries(Object.entries(p.activeTab ?? {}).filter(([id]) => !stale.has(id))) },
      theme: p.theme === "dark" ? "dark" : "light",
      settings: { ...base.settings, ...(p.settings ?? {}), emphasis: { ...DEFAULT_EMPHASIS, ...(p.settings?.emphasis ?? {}) } },
    };
  } catch {
    return base;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(s: AppState) {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const p: Persisted = { layouts: s.layouts, order: s.order, layoutId: s.layoutId, activeTab: s.activeTab, theme: s.theme, settings: s.settings };
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch {
      // Storage full or blocked: the workspace still works for this visit.
    }
  }, 250);
}

let ds: DataSource | null = null;
let unsyncCursor: (() => void) | null = null;
let generation = 0;

function stopSource() {
  unsyncCursor?.();
  unsyncCursor = null;
  ds?.dispose();
  ds = null;
}

/** Replay streams follow the app clock: mirror play, pause, speed and jumps to the server. */
function syncCursor(src: DataSource): () => void {
  let lastT = useCursor.getState().t;
  let lastWall = performance.now();
  let lastSync = 0;
  return useCursor.subscribe((c, prev) => {
    const now = performance.now();
    if (c.playing !== prev.playing) src.control({ op: c.playing ? "play" : "pause" });
    if (c.speed !== prev.speed) src.control({ op: "speed", x: c.speed });
    if (c.t !== prev.t) {
      const expected = lastT + (prev.playing ? ((now - lastWall) / 1000) * c.speed : 0);
      // A jump (scrub, lap step, keyboard) or a periodic re-sync while playing.
      if (Math.abs(c.t - expected) > 0.75 || now - lastSync > 2000) {
        src.control({ op: "seek", t: c.t });
        lastSync = now;
      }
      lastT = c.t;
      lastWall = now;
    }
  });
}

/** History for per-car topics starts shortly before the session window, not at the file start. */
function sinceFor(session: SessionModel | null): number | undefined {
  return session ? Math.max(0, session.window[0] - 120) : undefined;
}

export const useApp = create<AppState>((set, get) => {
  const ws = initialWorkspace();
  return {
    status: "empty",
    error: null,
    progress: null,
    source: null,
    summary: null,
    topicMap: null,
    hydrated: false,
    session: null,
    topics: {},
    loading: {},
    live: null,
    streamError: null,
    sessionPickerOpen: false,
    focus: null,
    compare: null,
    focusLap: null,
    compareLap: null,
    ...ws,
    maximized: null,
    picker: null,
    settingsOpen: false,

    async openSource(src) {
      const gen = ++generation;
      stopSource();
      const source = createSource(src);
      ds = source;
      const name = src.name ?? src.file?.name ?? decodeURIComponent(src.url?.split("/").pop()?.split("?")[0] || src.id || "session.mcap");
      // Every file opens on the first tab (Monitor) unless the address names one.
      const urlTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
      if (!urlTab) set({ activeTab: Object.fromEntries(Object.values(get().layouts).map((l) => [l.id, l.tabs[0].id])) });
      set({
        status: "opening",
        error: null,
        streamError: null,
        progress: { phase: src.file ? "index" : "download", loaded: 0, total: 0 },
        source: { kind: src.kind, name, url: src.url, id: src.id },
        summary: null,
        session: null,
        topics: {},
        loading: {},
        live: null,
        focus: null,
        compare: null,
        focusLap: null,
        compareLap: null,
        maximized: null,
      });
      try {
        const summary = await source.open((p) => gen === generation && set({ progress: p }));
        if (gen !== generation) return;
        const topicMap = resolveTopics(summary);
        set({ summary, topicMap, progress: { phase: "decode", loaded: 0, total: 1 } });
        const cols = await source.load(topicMap.core);
        if (gen !== generation) return;
        const topics: Record<string, Columns> = {};
        for (const col of cols) topics[col.topic] = col;
        const session = buildSession(summary, new Map(Object.entries(topics)));
        const st = get();
        let layoutId = st.layoutId;
        if (st.settings.autoLayout) layoutId = presetFor(session.kind).id;
        const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const wantLayout = params?.get("layout")?.toLowerCase();
        if (wantLayout) {
          const hit = st.order.find((id) => id === wantLayout || id === `preset:${wantLayout}` || slugName(st.layouts[id]?.name ?? "").startsWith(wantLayout));
          if (hit) layoutId = hit;
        }
        if (!st.layouts[layoutId]) layoutId = st.order[0];
        const head = source.live ? summary.duration : null;
        set({ status: "ready", progress: null, session, topics, layoutId, live: head != null ? { head, following: true } : null });
        const urlT = Number(params?.get("t"));
        const urlLap = Number(params?.get("lap"));
        const t0 =
          head != null
            ? head
            : Number.isFinite(urlT) && params?.get("t")
              ? urlT
              : Number.isFinite(urlLap) && params?.get("lap")
                ? (lapStart(session, urlLap) ?? defaultStart(session))
                : defaultStart(session);
        useCursor.setState({ t: t0, playing: false });
        if (source.streaming) {
          source.onUpdate = (u) => gen === generation && applyStreamUpdate(u);
          if (source.live) {
            // Any move away from the head (scrub, keys, lap step) stops following it.
            unsyncCursor = useCursor.subscribe((c) => {
              const l = get().live;
              if (l?.following && Math.abs(c.t - l.head) > 0.05) set({ live: { ...l, following: false } });
            });
          } else {
            unsyncCursor = syncCursor(source);
            source.control({ op: "speed", x: useCursor.getState().speed });
            source.control({ op: "seek", t: t0 });
          }
        }
        persist(get());
      } catch (err) {
        if (gen !== generation) return;
        set({ status: "error", error: err instanceof Error ? err.message : String(err), progress: null });
      }
    },

    closeFile() {
      generation++;
      stopSource();
      set({ status: "empty", session: null, summary: null, topicMap: null, topics: {}, loading: {}, source: null, error: null, progress: null, live: null, streamError: null });
      useCursor.setState({ t: 0, playing: false });
    },

    ensureTopics(list) {
      const st = get();
      const src = ds;
      if (!src || st.status !== "ready") return;
      const known = new Set(st.summary?.topics.map((t) => t.name));
      const want = list.filter((t) => known.has(t) && !st.topics[t] && !st.loading[t]);
      if (!want.length) return;
      const gen = generation;
      set({ loading: { ...st.loading, ...Object.fromEntries(want.map((t) => [t, true as const])) } });
      // Streams send per-car history from just before the session, not from the file start.
      const since = src.streaming && want.every((t) => st.summary?.topics.find((x) => x.name === t)?.entity) ? sinceFor(st.session) : undefined;
      src
        .load(want, since)
        .then((cols) => {
          if (gen !== generation) return;
          const topics = { ...get().topics };
          for (const c of cols) topics[c.topic] = c;
          const loading = { ...get().loading };
          for (const t of want) delete loading[t];
          set({ topics, loading });
        })
        .catch(() => {
          const loading = { ...get().loading };
          for (const t of want) delete loading[t];
          set({ loading });
        });
    },

    setFollowing(following) {
      const live = get().live;
      if (!live || live.following === following) return;
      set({ live: { ...live, following } });
      if (following) useCursor.setState({ t: live.head, playing: false });
    },
    setSessionPickerOpen(o) {
      set({ sessionPickerOpen: o });
    },

    setFocus(id, lap = null) {
      const st = get();
      if (id && id === st.compare) set({ compare: st.focus, compareLap: st.focusLap });
      set({ focus: id, focusLap: lap });
    },
    setCompare(id, lap = null) {
      const st = get();
      if (id && id === st.focus && lap == null) {
        set({ focus: st.compare, focusLap: st.compareLap, compare: id, compareLap: st.focusLap });
        return;
      }
      set({ compare: id, compareLap: lap });
    },
    swapSelection() {
      const st = get();
      set({ focus: st.compare, compare: st.focus, focusLap: st.compareLap, compareLap: st.focusLap });
    },

    layout() {
      const st = get();
      return st.layouts[st.layoutId] ?? Object.values(st.layouts)[0];
    },
    tab() {
      const l = get().layout();
      const id = get().activeTab[l.id];
      return l.tabs.find((t) => t.id === id) ?? l.tabs[0];
    },
    edit(fn) {
      const st = get();
      const l = st.layout();
      const next = fn(l);
      if (next === l) return;
      set({ layouts: { ...st.layouts, [l.id]: next } });
      // Keep the active tab valid after closes.
      const active = st.activeTab[l.id];
      if (!next.tabs.some((t) => t.id === active)) {
        const old = l.tabs.findIndex((t) => t.id === active);
        const pick = next.tabs[Math.max(0, Math.min(old, next.tabs.length - 1))];
        set({ activeTab: { ...get().activeTab, [l.id]: pick.id } });
      }
      if (st.maximized && !next.panels[st.maximized]) set({ maximized: null });
      persist(get());
    },
    setTab(tabId) {
      const l = get().layout();
      set({ activeTab: { ...get().activeTab, [l.id]: tabId }, maximized: null });
      persist(get());
    },
    addTab(name) {
      let id = "";
      get().edit((l) => {
        const r = L.addTab(l, name);
        id = r.tabId;
        return r.layout;
      });
      get().setTab(id);
      return id;
    },
    switchLayout(id) {
      if (!get().layouts[id]) return;
      set({ layoutId: id, maximized: null });
      persist(get());
    },
    saveLayoutAs(name) {
      const st = get();
      const src = st.layout();
      const id = L.uid("l");
      const copy: L.Layout = { ...structuredClone({ tabs: src.tabs, panels: src.panels }), id, name: name.trim() || "Untitled layout", version: 1 };
      const activeIdx = src.tabs.findIndex((t) => t.id === st.activeTab[src.id]);
      set({
        layouts: { ...st.layouts, [id]: copy },
        order: [...st.order, id],
        layoutId: id,
        activeTab: { ...st.activeTab, [id]: copy.tabs[Math.max(0, activeIdx)].id },
      });
      persist(get());
      return id;
    },
    renameLayout(id, name) {
      const st = get();
      const l = st.layouts[id];
      if (!l || !name.trim()) return;
      set({ layouts: { ...st.layouts, [id]: { ...l, name: name.trim() } } });
      persist(get());
    },
    deleteLayout(id) {
      const st = get();
      if (isPreset(id) || !st.layouts[id]) return;
      const layouts = { ...st.layouts };
      delete layouts[id];
      const order = st.order.filter((x) => x !== id);
      set({ layouts, order, layoutId: st.layoutId === id ? order[0] : st.layoutId });
      persist(get());
    },
    resetLayout(id) {
      const st = get();
      if (!isPreset(id)) return;
      const fresh = buildPreset(id);
      set({ layouts: { ...st.layouts, [id]: fresh }, activeTab: { ...st.activeTab, [id]: fresh.tabs[0].id }, maximized: null });
      persist(get());
    },
    importLayout(l) {
      const st = get();
      const id = L.uid("l");
      set({ layouts: { ...st.layouts, [id]: { ...l, id, preset: undefined } }, order: [...st.order, id], layoutId: id, activeTab: { ...st.activeTab, [id]: l.tabs[0].id } });
      persist(get());
    },
    setMaximized(id) {
      set({ maximized: id });
    },
    openPicker(p) {
      set({ picker: p });
    },
    setTheme(theme) {
      set({ theme });
      persist(get());
    },
    setSettings(s) {
      set({ settings: { ...get().settings, ...s } });
      persist(get());
    },
    setSettingsOpen(o) {
      set({ settingsOpen: o });
    },
  };
});

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let lastRebuild = 0;

/** Rebuild the session model from grown columns, at most once a second. */
function scheduleRebuild() {
  if (rebuildTimer) return;
  const wait = Math.max(0, 1000 - (performance.now() - lastRebuild));
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    lastRebuild = performance.now();
    const st = useApp.getState();
    if (st.status !== "ready" || !st.summary || !st.topicMap) return;
    const core = new Map(st.topicMap.core.filter((t) => st.topics[t]).map((t) => [t, st.topics[t]]));
    useApp.setState({ session: buildSession(st.summary, core) });
  }, wait);
}

/** Merge columns that grew on a server stream into the store. */
export function applyStreamUpdate(u: StreamUpdate) {
  const st = useApp.getState();
  if (st.status !== "ready") return;
  const patch: Partial<AppState> = {};
  if (u.columns.length) {
    const topics = { ...st.topics };
    for (const c of u.columns) topics[c.topic] = c;
    patch.topics = topics;
  }
  const coreSet = new Set(st.topicMap?.core);
  let rebuild = u.columns.some((c) => coreSet.has(c.topic));
  if (st.live && u.head != null && u.head > st.live.head) {
    patch.live = { ...st.live, head: u.head };
    if (st.summary && u.head > st.summary.duration) {
      patch.summary = { ...st.summary, duration: u.head };
      rebuild = true;
    }
    if (st.live.following) useCursor.setState({ t: u.head });
  }
  if (u.closed) patch.streamError = u.closed;
  useApp.setState(patch);
  if (rebuild) scheduleRebuild();
}

/** Restore the saved workspace (client only, after hydration). */
export function hydrateWorkspace() {
  const p = loadPersisted();
  useApp.setState({ ...p, hydrated: true });
}

/** Start of the replay: first segment start. */
export function defaultStart(s: SessionModel): number {
  return s.segments[0]?.t0 ?? s.window[0];
}

/** A little after the first car starts lap `n`, so the lap shows as in progress. */
export function lapStart(s: SessionModel, n: number): number | null {
  let t: number | null = null;
  for (const l of s.laps) if (l.n === n && (t == null || l.t0 < t)) t = l.t0;
  return t != null ? t + 30 : null;
}

/** Replay bounds for the scrubber. */
export function replayRange(s: SessionModel, full: boolean): [number, number] {
  return full ? [0, s.duration] : s.window;
}

function slugName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

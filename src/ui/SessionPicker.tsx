"use client";
import { useEffect, useMemo, useState } from "react";
import { API_URL, fileUrl, groupSessions, listSessions, type ApiSession } from "@/data/api";
import type { SourceSpec } from "@/data/source";
import { useApp } from "@/state/app";
import { Button } from "./controls";
import { Modal } from "./Dialogs";
import { IconDownload, IconLive, IconPlay, IconSearch } from "./icons";
import css from "./SessionPicker.module.css";

function fmtDate(s: ApiSession): string {
  const ns = s.scheduled_start_ns ?? s.start_ns;
  const d = new Date(ns / 1e6);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtBytes(b?: number): string {
  if (!b) return "";
  return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`;
}

function fmtDur(s: ApiSession): string {
  const sched = s.scheduled_start_ns && (s as { scheduled_end_ns?: number }).scheduled_end_ns ? ((s as { scheduled_end_ns?: number }).scheduled_end_ns! - s.scheduled_start_ns) / 1e9 : s.duration;
  const m = Math.round(sched / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

/** Open a server session and put it in the address so a reload reopens it. */
export function openServerSession(spec: SourceSpec) {
  const p = new URLSearchParams();
  if (spec.kind === "url") p.set("src", spec.url!);
  else {
    p.set("api", spec.id!);
    if (spec.kind === "live") p.set("live", "1");
  }
  window.history.replaceState(null, "", `${window.location.pathname}?${p.toString().replace(/%2F/g, "/").replace(/%3A/g, ":")}`);
  useApp.getState().openSource(spec);
}

export function SessionPicker() {
  const open = useApp((s) => s.sessionPickerOpen);
  if (!open) return null;
  return <SessionPickerBody />;
}

function SessionPickerBody() {
  const current = useApp((s) => s.source);
  const close = () => useApp.getState().setSessionPickerOpen(false);
  const [list, setList] = useState<ApiSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    listSessions(API_URL, ac.signal)
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e: unknown) => !ac.signal.aborted && setError(e instanceof Error ? e.message : String(e)));
    return () => ac.abort();
  }, [attempt]);

  const groups = useMemo(() => {
    if (!list) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (s: ApiSession) => {
      const hay = `${s.event} ${s.session} ${s.country ?? ""} ${s.location ?? ""} ${s.circuit ?? ""} ${s.season ?? ""} r${s.round ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    return groupSessions(list.filter(hit));
  }, [list, q]);

  const go = (spec: SourceSpec) => {
    close();
    openServerSession(spec);
  };

  return (
    <Modal title="Sessions" onClose={close} wide>
      <div className={css.toolbar}>
        <label className={css.search}>
          <IconSearch size={14} />
          <input autoFocus placeholder="Filter by event, session, circuit, round" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter sessions" />
        </label>
        <span className={css.server} title="NEXT_PUBLIC_API_URL">
          {API_URL.replace(/^https?:\/\//, "")}
        </span>
      </div>
      {error ? (
        <div className={css.state}>
          {error}
          <br />
          Run <code>npm run server</code> (or <code>npm run dev:all</code>) and try again.
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => setAttempt((a) => a + 1)}>Retry</Button>
          </div>
        </div>
      ) : !list ? (
        <div className={css.state}>Loading sessions…</div>
      ) : !groups.length ? (
        <div className={css.state}>{q ? "No session matches." : "The server has no sessions. Point RACING_DATA_DIR at a folder of .mcap files."}</div>
      ) : (
        <div className={css.list} role="listbox" aria-label="Sessions" data-testid="session-list">
          {groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.title}>
              <div className={css.group}>
                <span className={css.groupTitle}>{g.title}</span>
                <span className={css.groupSub}>{g.subtitle}</span>
              </div>
              {g.sessions.map((s) => {
                const isCurrent = current?.id === s.id;
                const primary: SourceSpec = s.live ? { kind: "live", id: s.id, name: s.title ?? s.id } : { kind: "replay", id: s.id, name: `${s.event} · ${s.session}` };
                return (
                  <div key={s.id} className={css.row} role="option" aria-selected={isCurrent} data-current={isCurrent} data-session-id={s.id} onClick={() => go(primary)} title={s.live ? "Follow live" : "Stream from the server"}>
                    <span className={css.name}>
                      {s.live && <span className={css.liveDot} aria-hidden />}
                      {s.live ? `${s.event} · ${s.session}` : s.session}
                    </span>
                    <span className={css.muted}>{s.live ? "receiving" : fmtDate(s)}</span>
                    <span className={`${css.muted} num`}>{s.live ? "" : fmtDur(s)}</span>
                    <span className={`${css.muted} num`}>{fmtBytes(s.bytes)}</span>
                    <span className={css.actions} onClick={(e) => e.stopPropagation()}>
                      <button className={css.act} onClick={() => go(primary)} aria-label={`Open ${s.session}`}>
                        <IconPlay size={12} /> {s.live ? "Follow" : "Replay"}
                      </button>
                      {!s.live && (
                        <>
                          <button className={css.act} onClick={() => go({ kind: "live", id: s.id, name: `${s.event} · ${s.session} (live)` })} title="Replay in real time as a simulated live feed" aria-label={`Simulate live ${s.session}`}>
                            <IconLive size={12} /> Live
                          </button>
                          <button className={css.act} onClick={() => go({ kind: "url", url: fileUrl(s.id), name: `${s.event} · ${s.session}` })} title="Download the whole file and decode it in the browser" aria-label={`Load file ${s.session}`}>
                            <IconDownload size={12} /> File
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { lapState } from "@/derive/timing";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { timeOfDay } from "@/ui/clock";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip, Pill } from "./cells";
import { useT } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import tcss from "./table.module.css";
import css from "./radio.module.css";

export interface RadioConfig {
  onlySelected?: boolean;
}

/** Team radio clips up to the replay time, newest first. Files carry audio links, not transcripts. */
function TeamRadio({ session, config, setConfig }: WidgetProps<RadioConfig>) {
  const t = useT(2);
  const panel = usePanel();
  const clock = useApp((s) => s.settings.clock);
  const focus = useApp((s) => s.focus);
  const compare = useApp((s) => s.compare);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const race = session.kind === "race";

  const list = session.radio.filter((r) => r.t <= t && (!config.onlySelected || r.entity === focus || r.entity === compare)).reverse();
  const play = (url: string) => {
    if (playing === url) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(url);
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    void a.play().catch(() => setPlaying(null));
    audio.current = a;
    setPlaying(url);
  };
  const lapLabel = (entity: string, at: number) => {
    if (race && at < (session.segments[0]?.t0 ?? 0)) return "Pre";
    const s = lapState(session.lapsByEntity.get(entity), at);
    const n = s.live.lap?.n ?? (s.last ? s.last.n + 1 : null);
    return n ? `L${n}` : "\u2014";
  };

  return (
    <div
      className={css.wrap}
      data-testid="team-radio"
      onContextMenu={(e) =>
        openMenu(
          e,
          [
            { id: "sel", label: "Only A and B", checked: !!config.onlySelected, run: () => setConfig({ onlySelected: !config.onlySelected }) },
            { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() },
          ],
          "Team radio",
        )
      }
    >
      <HeaderSlot>
        <span>{session.radio.length ? `${list.length} of ${session.radio.length}` : ""}</span>
      </HeaderSlot>
      {!session.radio.length ? (
        <div className={tcss.empty}>No team radio in this file</div>
      ) : !list.length ? (
        <div className={tcss.empty}>No radio yet at this time</div>
      ) : (
        <table className={`${tcss.table} num`}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 50 }} />
            <col />
          </colgroup>
          <tbody>
            {list.map((r, i) => {
              const e = session.entityById.get(r.entity);
              const on = playing === r.url;
              return (
                <tr key={`${r.t}-${i}`} onClick={() => useCursor.getState().setT(r.t)}>
                  <td>
                    <Pill muted>{lapLabel(r.entity, r.t)}</Pill>
                  </td>
                  <td>
                    <Pill>{timeOfDay(session, r.t, clock).text}</Pill>
                  </td>
                  <td className={tcss.l}>{e ? <DriverChip entity={e} /> : r.entity}</td>
                  <td className={tcss.l}>
                    <button
                      className={css.play}
                      aria-label={on ? "Stop" : "Play"}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        play(r.url);
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                        {on ? <rect x="1.5" y="1.5" width="7" height="7" fill="currentColor" /> : <path d="M2 1 L9 5 L2 9 Z" fill="currentColor" />}
                      </svg>
                    </button>
                    <span className={css.note}>{on ? "Playing" : "Audio clip"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export const radioWidget: WidgetDef<RadioConfig> = {
  type: "radio",
  name: "Team radio",
  description: "Team radio clips up to the replay time, with playback",
  group: "Session",
  Component: TeamRadio,
};

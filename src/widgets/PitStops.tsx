"use client";
import { useMemo } from "react";
import { DASH } from "@/data/format";
import type { SessionModel } from "@/derive/model";
import { useCursor } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { openEntityMenu } from "@/ui/actions";
import { HeaderSlot, usePanel } from "@/ui/panelContext";
import { DriverChip, Pill, TyreGlyph } from "./cells";
import { useT } from "./hooks";
import type { WidgetDef, WidgetProps } from "./types";
import tcss from "./table.module.css";

interface StopRow {
  t: number;
  entity: string;
  n: number;
  lap: number | null;
  stop: number | null;
  lane: number | null;
  from: string | null;
  to: string | null;
}

/** Every pit stop with its count, stationary and lane time and the compounds before and after. */
export function pitStops(s: SessionModel): StopRow[] {
  const count = new Map<string, number>();
  return [...s.pits]
    .sort((a, b) => a.t - b.t)
    .map((p) => {
      const n = (count.get(p.entity) ?? 0) + 1;
      count.set(p.entity, n);
      const mine = s.stints.filter((x) => x.entity === p.entity).sort((a, b) => a.lapStart - b.lapStart);
      const lap = p.lap;
      const after = lap != null ? mine.find((x) => x.lapStart > lap) : undefined;
      const before = lap != null ? [...mine].reverse().find((x) => x.lapStart <= lap) : undefined;
      return { t: p.t, entity: p.entity, n, lap, stop: p.stop, lane: p.lane, from: before?.compound ?? null, to: after?.compound ?? null };
    });
}

function PitStops({ session }: WidgetProps) {
  const t = useT(2);
  const panel = usePanel();
  const all = useMemo(() => pitStops(session), [session]);
  const shown = all.filter((r) => r.t <= t).reverse();
  const fastest = Math.min(...shown.map((r) => r.stop ?? Infinity));

  return (
    <div className={tcss.scroll} onContextMenu={(e) => openMenu(e, [{ kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Pit stops")} data-testid="pit-stops">
      <HeaderSlot>
        <span>{shown.length ? `${shown.length} stops` : ""}</span>
      </HeaderSlot>
      <table className={`${tcss.table} num`}>
        <colgroup>
          <col style={{ width: 24 }} />
          <col style={{ width: 44 }} />
          <col style={{ width: 34 }} />
          <col style={{ width: 64 }} />
          <col style={{ width: 46 }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th title="Stop number for this driver">#</th>
            <th className={tcss.l}>Driver</th>
            <th>Lap</th>
            <th title="Stationary time">Stationary</th>
            <th style={{ textAlign: "center" }} title="Compound before and after">Tyres</th>
            <th title="Time in the pit lane">Pit lane</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const e = session.entityById.get(r.entity);
            return (
              <tr key={`${r.entity}-${r.n}`} onClick={() => useCursor.getState().setT(r.t)} onContextMenu={(ev) => openEntityMenu(ev, r.entity)}>
                <td>
                  <Pill>{r.n}</Pill>
                </td>
                <td className={tcss.l}>{e ? <DriverChip entity={e} /> : r.entity}</td>
                <td>
                  <Pill muted={r.lap == null}>{r.lap ?? DASH}</Pill>
                </td>
                <td>
                  <Pill tone={r.stop != null && r.stop <= fastest + 1e-9 ? "sb" : "none"} muted={r.stop == null}>
                    {r.stop != null ? `${r.stop.toFixed(1)} s` : DASH}
                  </Pill>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                    <TyreGlyph compound={r.from} />
                    <TyreGlyph compound={r.to} />
                  </span>
                </td>
                <td>
                  <Pill muted={r.lane == null}>{r.lane != null ? `${r.lane.toFixed(1)} s` : DASH}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!shown.length && <div className={tcss.empty}>{all.length ? "No stops yet" : "This file has no pit stops"}</div>}
    </div>
  );
}

export const pitStopsWidget: WidgetDef = {
  type: "pitstops",
  name: "Pit stops",
  description: "Every stop up to the replay time: lap, stationary time, tyres and lane time",
  group: "Timing",
  Component: PitStops,
};

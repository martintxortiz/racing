"use client";
import { useMemo } from "react";
import type { Lap, SessionModel } from "@/derive/model";
import { lapTrace, type LapTrace } from "@/derive/trace";
import { useApp } from "@/state/app";
import { telemetryTopic, useTopics, type Selection } from "./hooks";

export interface SideTrace {
  entity: string;
  lap: Lap;
  trace: LapTrace | null;
}

/** Distance-resampled telemetry for the A and B laps of a selection. */
export function useSelectionTraces(session: SessionModel, sel: Selection, fields: string[]): { a: SideTrace | null; b: SideTrace | null; loading: boolean } {
  const ta = sel.a ? telemetryTopic(sel.a.entity) : null;
  const tb = sel.b ? telemetryTopic(sel.b.entity) : null;
  const topics = [ta, tb].filter((x): x is string => !!x);
  const { cols, loading } = useTopics(topics);
  const ca = ta ? cols[ta] : undefined;
  const cb = tb ? cols[tb] : undefined;
  const fkey = fields.join("|");
  const len = session.outline?.length ?? null;
  const a = useMemo(() => {
    if (!sel.a) return null;
    const { lap } = sel.a;
    return { entity: sel.a.entity, lap, trace: ca && lap.t1 != null ? lapTrace(ca, lap.t0, lap.t1, len, fkey.split("|")) : null };
  }, [sel.a, ca, len, fkey]);
  const b = useMemo(() => {
    if (!sel.b) return null;
    const { lap } = sel.b;
    return { entity: sel.b.entity, lap, trace: cb && lap.t1 != null ? lapTrace(cb, lap.t0, lap.t1, len, fkey.split("|")) : null };
  }, [sel.b, cb, len, fkey]);
  return { a, b, loading };
}

/** Numeric fields of the telemetry topic for an entity (or any telemetry topic), from the file summary. */
export function useTelemetryFields(entity: string | null): string[] {
  const summary = useApp((s) => s.summary);
  return useMemo(() => {
    if (!summary) return [];
    const name = entity ? telemetryTopic(entity) : null;
    const topic = summary.topics.find((t) => (name ? t.name === name : /\/telemetry$/.test(t.name)));
    return topic ? topic.fields.filter((f) => f.kind === "num").map((f) => f.name) : [];
  }, [summary, entity]);
}

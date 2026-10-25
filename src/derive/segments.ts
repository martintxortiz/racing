import type { RcEvent, Segment, SessionKind } from "./model";

const START = /SESSION (?:STARTED|RESUMED)/;
const END = /SESSION (?:FINISHED|ENDED|COMPLETE)/;

/**
 * Session segments from race control session status messages: Q1/Q2/Q3 in qualifying, one
 * segment otherwise. Falls back to the span of lap data.
 */
export function buildSegments(kind: SessionKind, events: RcEvent[], fallback: [number, number], name: string): Segment[] {
  const status = events.filter((e) => e.category === "SessionStatus" || START.test(e.message) || END.test(e.message));
  const starts = status.filter((e) => START.test(e.message));
  const ends = status.filter((e) => END.test(e.message));
  if (kind === "qualifying") {
    const phases = new Map<number, Segment>();
    let lastPhase = 0;
    for (const e of events) {
      if (e.phase != null) lastPhase = e.phase;
      const phase = e.phase ?? lastPhase;
      if (!phase) continue;
      if (START.test(e.message) && !phases.has(phase)) {
        phases.set(phase, { id: `Q${phase}`, label: `Q${phase}`, t0: e.t, t1: e.t });
      } else if (END.test(e.message) && phases.has(phase)) {
        phases.get(phase)!.t1 = e.t;
      }
    }
    const segs = [...phases.values()].sort((a, b) => a.t0 - b.t0);
    if (segs.length) {
      // A phase missing its finish message ends at the next start or at the lap span end.
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].t1 <= segs[i].t0) segs[i].t1 = segs[i + 1]?.t0 ?? fallback[1];
      }
      return segs;
    }
  }
  const label = kind === "race" ? "Race" : shortName(name);
  if (starts.length) {
    const t0 = starts[0].t;
    const after = ends.filter((e) => e.t > t0);
    // The finish message comes with the leader's flag; the field finishes after it.
    const t1 = Math.max(after.length ? after[after.length - 1].t : t0, fallback[1]);
    return [{ id: "S", label, t0, t1 }];
  }
  return [{ id: "S", label, t0: fallback[0], t1: fallback[1] }];
}

function shortName(name: string): string {
  const m = /practice\s*(\d)/i.exec(name);
  if (m) return `FP${m[1]}`;
  return name.length <= 12 ? name : "Session";
}

/** Replay window: from 5 min before the first segment to 10 min after the last. */
export function sessionWindow(segments: Segment[], duration: number): [number, number] {
  if (!segments.length) return [0, duration];
  const a = Math.max(0, segments[0].t0 - 300);
  const b = Math.min(duration, segments[segments.length - 1].t1 + 600);
  return b > a ? [a, b] : [0, duration];
}

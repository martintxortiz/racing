import { describe, expect, it } from "vitest";
import type { RcEvent } from "@/derive/model";
import { buildPreset, PRESETS, PRESET_REV } from "@/layout/presets";
import { eventType } from "@/widgets/Events";
import { spread } from "@/widgets/Ladder";
import { compass } from "@/widgets/Session";

const rc = (p: Partial<RcEvent>): RcEvent => ({ t: 0, category: "Other", flag: null, scope: null, sector: null, entity: null, lap: null, phase: null, message: "", ...p });

describe("monitor preset", () => {
  it("puts the Monitor tab first in every preset and stamps the preset revision", () => {
    for (const p of PRESETS) {
      const l = buildPreset(p.id);
      expect(l.tabs[0].name).toBe("Monitor");
      expect(l.rev).toBe(PRESET_REV);
    }
  });
});

describe("lap time distribution labels", () => {
  it("pushes overlapping labels apart and keeps them inside the range", () => {
    const out = spread([10, 10, 10], 12, 0, 100);
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(12);
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(12);
    const top = spread([98, 99, 100], 12, 0, 100);
    expect(top[2]).toBeLessThanOrEqual(100);
    expect(top[0]).toBeLessThanOrEqual(76);
  });
});

describe("race control type", () => {
  it("labels flags with their sector and classifies stewards' messages", () => {
    expect(eventType(rc({ flag: "YELLOW", scope: "Sector", sector: 4 }))).toEqual({ label: "Yellow S4", tone: "flagYellow" });
    expect(eventType(rc({ message: "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 1" })).label).toBe("Penalty");
    expect(eventType(rc({ message: "CAR 4 TRACK LIMITS AT TURN 7" })).label).toBe("Track limits");
  });
});

describe("compass", () => {
  it("maps degrees to 16 points", () => {
    expect(compass(0)).toBe("N");
    expect(compass(90)).toBe("E");
    expect(compass(-45)).toBe("NW");
    expect(compass(359)).toBe("N");
  });
});

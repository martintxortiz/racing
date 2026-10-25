import { describe, expect, it } from "vitest";
import { DEFAULT_EMPHASIS, gapTrendTone, placesTone } from "@/widgets/emphasis";
import { eventType } from "@/widgets/Events";
import type { RcEvent } from "@/derive/model";

describe("emphasis", () => {
  it("colours the gap ahead only past the threshold", () => {
    expect(gapTrendTone(-0.1, DEFAULT_EMPHASIS)).toBe("none");
    expect(gapTrendTone(0.29, DEFAULT_EMPHASIS)).toBe("none");
    expect(gapTrendTone(-0.3, DEFAULT_EMPHASIS)).toBe("good");
    expect(gapTrendTone(0.5, DEFAULT_EMPHASIS)).toBe("bad");
    expect(gapTrendTone(null, DEFAULT_EMPHASIS)).toBe("none");
    expect(gapTrendTone(-0.5, { ...DEFAULT_EMPHASIS, gap: 1 })).toBe("none");
  });
  it("colours place changes only from three places", () => {
    expect(placesTone(2, DEFAULT_EMPHASIS)).toBe("none");
    expect(placesTone(-2, DEFAULT_EMPHASIS)).toBe("none");
    expect(placesTone(3, DEFAULT_EMPHASIS)).toBe("good");
    expect(placesTone(-4, DEFAULT_EMPHASIS)).toBe("bad");
  });
  it("keeps routine race control messages grey", () => {
    const rc = (p: Partial<RcEvent>) => ({ t: 0, lap: null, category: "Flag", message: "", ...p }) as RcEvent;
    expect(eventType(rc({ flag: "GREEN" })).tone).toBe("neutral");
    expect(eventType(rc({ flag: "CLEAR" })).tone).toBe("neutral");
    expect(eventType(rc({ category: "Other", message: "CAR 1 NOTED" })).tone).toBe("neutral");
    expect(eventType(rc({ flag: "RED" })).tone).toBe("flagRed");
  });
});

import { describe, expect, it } from "vitest";

import { AVATAR_SIZE, coverSquarePlacement, maxOffset } from "../lib/avatar";

describe("coverSquarePlacement", () => {
  const none = { x: 0, y: 0 };

  it("fills the square for a square source at zoom 1", () => {
    expect(coverSquarePlacement({ width: 100, height: 100 }, 1, none)).toEqual({
      x: 0,
      y: 0,
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    });
  });

  it("centre-crops a wide source", () => {
    expect(coverSquarePlacement({ width: 64, height: 32 }, 1, none)).toEqual({
      x: -16,
      y: 0,
      width: 64,
      height: 32,
    });
  });

  it("centre-crops a tall source", () => {
    expect(coverSquarePlacement({ width: 32, height: 64 }, 1, none)).toEqual({
      x: 0,
      y: -16,
      width: 32,
      height: 64,
    });
  });

  it("scales with zoom and applies the offset", () => {
    expect(
      coverSquarePlacement({ width: 100, height: 100 }, 2, { x: 0.5, y: 0 }),
    ).toEqual({ x: 0, y: -16, width: 64, height: 64 });
  });
});

describe("maxOffset", () => {
  it("is zero for a square source that already covers", () => {
    expect(maxOffset({ width: 100, height: 100 }, 1)).toEqual({ x: 0, y: 0 });
  });

  it("grows with zoom", () => {
    expect(maxOffset({ width: 100, height: 100 }, 2)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("allows more travel on the overflowing axis", () => {
    expect(maxOffset({ width: 64, height: 32 }, 1)).toEqual({ x: 0.5, y: 0 });
  });
});

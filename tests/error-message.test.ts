import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { getErrorMessage } from "../lib/error-message";

describe("getErrorMessage", () => {
  it("returns the server message for a string ConvexError", () => {
    expect(
      getErrorMessage(new ConvexError("That username is already taken.")),
    ).toBe("That username is already taken.");
  });

  it("falls back to a generic message for unknown errors", () => {
    const generic = "Something went wrong. Please try again.";
    expect(getErrorMessage(new Error("boom"))).toBe(generic);
    expect(getErrorMessage(new ConvexError({ code: 1 }))).toBe(generic);
    expect(getErrorMessage(undefined)).toBe(generic);
  });
});

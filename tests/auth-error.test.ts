import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { getAuthErrorMessage } from "../lib/auth-error";
import {
  emailPattern,
  normalizeEmail,
  normalizeUsername,
  usernamePattern,
} from "../lib/auth-validation";

describe("getAuthErrorMessage", () => {
  const cases: Array<[string, "signIn" | "signUp", string]> = [
    ["Invalid credentials.", "signIn", "Incorrect email or password."],
    ["invalidsecret", "signIn", "Incorrect email or password."],
    ["invalidaccountid", "signIn", "Incorrect email or password."],
    [
      "toomanyfailedattempts",
      "signIn",
      "Too many failed attempts. Please try again later.",
    ],
    [
      "That username is already taken.",
      "signUp",
      "That username is already taken.",
    ],
    [
      "Use 3–20 letters, numbers, or underscores for your username.",
      "signUp",
      "Use 3–20 letters, numbers, or underscores for your username.",
    ],
    ["access_denied", "signIn", "Sign-in was cancelled."],
    ["AccessDenied", "signIn", "Sign-in was cancelled."],
    [
      "OAuthAccountNotLinked",
      "signIn",
      "This email is already linked to a different sign-in method.",
    ],
    ["EmailNotVerified", "signIn", "Verify your email address to continue."],
    ["email_not_verified", "signIn", "Verify your email address to continue."],
    [
      "Configuration",
      "signIn",
      "Sign-in is temporarily unavailable. Please try again later.",
    ],
    [
      "clientid",
      "signIn",
      "Sign-in is temporarily unavailable. Please try again later.",
    ],
    [
      "Invalid password.",
      "signUp",
      "Use 8–128 characters with uppercase, lowercase, a number, and a special character.",
    ],
    ["Enter a valid email address.", "signUp", "Enter a valid email address."],
  ];

  it.each(cases)("maps %j (%s) to %j", (error, flow, expected) => {
    expect(getAuthErrorMessage(error, flow)).toBe(expected);
  });

  it("only reveals the existing account on sign up", () => {
    const error = new ConvexError("An account with this email already exists.");
    expect(getAuthErrorMessage(error, "signUp")).toBe(
      "An account with this email already exists.",
    );
    expect(getAuthErrorMessage(error, "signIn")).toBe(
      "Unable to sign in. Please try again.",
    );
  });

  it("falls back per flow for unknown errors", () => {
    expect(getAuthErrorMessage("weird", "signIn")).toBe(
      "Unable to sign in. Please try again.",
    );
    expect(getAuthErrorMessage("weird", "signUp")).toBe(
      "Unable to create your account. Please try again.",
    );
  });

  it("reads the message from an Error instance", () => {
    expect(
      getAuthErrorMessage(new Error("Invalid credentials."), "signIn"),
    ).toBe("Incorrect email or password.");
  });
});

describe("validation", () => {
  it("accepts and rejects emails", () => {
    for (const email of ["a@b.co", "a.b+c@d.io"]) {
      expect(emailPattern.test(email)).toBe(true);
    }
    for (const email of ["a@b", "a b@c.co", "@b.co", "a@b.", "plain"]) {
      expect(emailPattern.test(email)).toBe(false);
    }
  });

  it("accepts and rejects usernames", () => {
    for (const username of ["abc", "a_b_1", "a".repeat(20)]) {
      expect(usernamePattern.test(username)).toBe(true);
    }
    for (const username of ["ab", "A B", "a".repeat(21), "ab-", "jöhn"]) {
      expect(usernamePattern.test(username)).toBe(false);
    }
  });

  it("normalizes input", () => {
    expect(normalizeUsername("  Rider_1 ")).toBe("rider_1");
    expect(normalizeEmail("  A@B.com ")).toBe("a@b.com");
  });
});

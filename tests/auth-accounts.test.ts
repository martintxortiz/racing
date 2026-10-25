import { defineTestApp } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../convex/schema";
import * as users from "../convex/users";
import * as authFunctions from "../convex/auth";
import {
  createOrUpdateUser,
  googleProfile,
  passwordProfile,
  validatePasswordRequirements,
  type CreateOrUpdateUserArgs,
} from "../convex/auth";
import type { MutationCtx } from "../convex/_generated/server";
import { generatedAvatarUrl } from "../lib/avatar";

const { api, createTest } = defineTestApp({ schema }).defineModules({
  users,
  auth: authFunctions,
});

const provision = (
  t: ReturnType<typeof createTest>,
  args: CreateOrUpdateUserArgs,
) => t.run((ctx) => createOrUpdateUser(ctx as unknown as MutationCtx, args));

const seedUser = (
  t: ReturnType<typeof createTest>,
  doc: { email?: string; username?: string; emailVerificationTime?: number },
) => t.run((ctx) => ctx.db.insert("users", doc));

describe("createOrUpdateUser", () => {
  it("preserves the signed-in account email and profile when linking Google", async () => {
    const t = createTest();
    const userId = await seedUser(t, {
      email: "admin@admin.com",
      username: "admin",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { image: "data:image/png;base64,avatar" });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: "admin@admin.com",
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("googleLinkRequests", {
        userId,
        sessionId,
        requestedAt: Date.now(),
      });
      await ctx.db.insert("authVerifiers", { sessionId });
    });

    const linkedId = await provision(t, {
      existingUserId: null,
      type: "oauth",
      provider: { id: "google" },
      profile: {
        email: "hello@hello.com",
        emailVerified: true,
        name: "Hello",
        image: "https://google/avatar",
      },
    });

    expect(linkedId).toBe(userId);
    expect(await t.run((ctx) => ctx.db.get(userId))).toMatchObject({
      email: "admin@admin.com",
      username: "admin",
      image: "data:image/png;base64,avatar",
    });
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
      1,
    );
  });

  it("creates a new user from an unlinked provider and a generated avatar", async () => {
    const t = createTest();
    const id = await provision(t, {
      existingUserId: null,
      type: "oauth",
      provider: { id: "google" },
      profile: { email: " Rider@Example.com ", name: "Rider" },
    });

    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      email: "rider@example.com",
      username: "rider",
      name: "Rider",
      image: generatedAvatarUrl("rider"),
    });
  });

  it("rejects ambiguous OAuth callbacks instead of linking the wrong user", async () => {
    const t = createTest();
    const userId = await seedUser(t, { email: "admin@admin.com" });
    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("googleLinkRequests", {
        userId,
        sessionId,
        requestedAt: Date.now(),
      });
      await ctx.db.insert("authVerifiers", { sessionId });
      const otherSessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("authVerifiers", { sessionId: otherSessionId });
    });

    await expect(
      provision(t, {
        existingUserId: null,
        type: "oauth",
        provider: { id: "google" },
        profile: { email: "hello@hello.com" },
      }),
    ).rejects.toMatchObject({
      data: "Finish one Google connection before starting another.",
    });
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
      1,
    );
  });

  it("does not link providers just because their emails match", async () => {
    const t = createTest();
    const existingUserId = await seedUser(t, {
      email: "other@example.com",
      emailVerificationTime: Date.now(),
    });

    await expect(
      provision(t, {
        existingUserId: null,
        type: "oauth",
        provider: { id: "google" },
        profile: { email: "other@example.com" },
      }),
    ).rejects.toMatchObject({
      data: "An account with this email already exists.",
    });
    expect(await t.run((ctx) => ctx.db.get(existingUserId))).toBeTruthy();
  });
});

describe("passwordProfile", () => {
  it("normalizes and requires a username only on sign up", () => {
    expect(
      passwordProfile({
        flow: "signUp",
        email: " A@B.com ",
        username: " Rider_1 ",
        password: "Passw0rd!",
      }),
    ).toEqual({ email: "a@b.com", username: "rider_1" });

    expect(
      passwordProfile({
        flow: "signIn",
        email: "a@b.com",
        password: "Passw0rd!",
      }),
    ).toEqual({ email: "a@b.com" });
  });

  it("rejects bad email, username, and oversized passwords", () => {
    expect(() =>
      passwordProfile({ flow: "signUp", email: "nope", username: "rider" }),
    ).toThrow("Enter a valid email address.");
    expect(() =>
      passwordProfile({ flow: "signUp", email: "a@b.com", username: "AB" }),
    ).toThrow(/username/);
    expect(() =>
      passwordProfile({
        flow: "signIn",
        email: "a@b.com",
        password: "x".repeat(129),
      }),
    ).toThrow("Invalid credentials.");
  });
});

describe("validatePasswordRequirements", () => {
  it("accepts strong passwords and rejects each weak case", () => {
    for (const password of ["Passw0rd!", "aA1!aaaa"]) {
      expect(() => validatePasswordRequirements(password)).not.toThrow();
    }
    for (const password of [
      "Passw0rd",
      "passw0rd!",
      "PASSW0RD!",
      "Password!",
      "Pa1!a",
      `${"aA1!".repeat(33)}`,
    ]) {
      expect(() => validatePasswordRequirements(password)).toThrow(
        "Invalid password.",
      );
    }
  });
});

describe("googleProfile", () => {
  it("rejects missing or unverified emails", () => {
    expect(() =>
      googleProfile({ sub: "1", email: "a@b.com", email_verified: false }),
    ).toThrow();
    expect(() => googleProfile({ sub: "1", email_verified: true })).toThrow();
  });

  it("normalizes the email and marks it verified", () => {
    const profile = googleProfile({
      sub: "1",
      email: " A@B.com ",
      picture: "https://x/default-user.png",
      email_verified: true,
    });
    expect(profile.email).toBe("a@b.com");
    expect(profile.emailVerified).toBe(true);
    expect(profile.name).toBeUndefined();
    expect(profile.image).toBeUndefined();
  });
});

describe("users queries", () => {
  it("isUsernameAvailable reports free, taken, and malformed names", async () => {
    const t = createTest();
    await seedUser(t, { email: "a@b.com", username: "rider" });

    expect(
      await t.query(api.users.isUsernameAvailable, { username: "rider" }),
    ).toBe(false);
    expect(
      await t.query(api.users.isUsernameAvailable, { username: "free" }),
    ).toBe(true);
    expect(
      await t.query(api.users.isUsernameAvailable, { username: "NO" }),
    ).toBe(false);
  });

  it("me is null when anonymous and reports linked providers otherwise", async () => {
    const t = createTest();
    expect(await t.query(api.users.me, {})).toBeNull();

    const id = await seedUser(t, { email: "a@b.com", username: "rider" });
    const me = await t.withIdentity({ subject: id }).query(api.users.me, {});
    expect(me).toMatchObject({
      username: "rider",
      email: "a@b.com",
      hasPassword: false,
      hasGoogle: false,
    });

    await t.run((ctx) =>
      ctx.db.insert("authAccounts", {
        userId: id,
        provider: "google",
        providerAccountId: "g1",
      }),
    );
    const linked = await t
      .withIdentity({ subject: id })
      .query(api.users.me, {});
    expect(linked?.hasGoogle).toBe(true);
  });
});

describe("updateUsername", () => {
  it("normalizes and saves a new username for the signed-in user", async () => {
    const t = createTest();
    const id = await seedUser(t, { email: "a@b.com", username: "rider" });

    await t
      .withIdentity({ subject: id })
      .mutation(api.users.updateUsername, { username: " Rider_2 " });

    expect((await t.run((ctx) => ctx.db.get(id)))?.username).toBe("rider_2");
  });

  it("rejects a username taken by another user", async () => {
    const t = createTest();
    const id = await seedUser(t, { email: "a@b.com", username: "rider" });
    await seedUser(t, { email: "c@d.com", username: "taken" });

    await expect(
      t
        .withIdentity({ subject: id })
        .mutation(api.users.updateUsername, { username: "taken" }),
    ).rejects.toMatchObject({ data: "That username is already taken." });
  });

  it("rejects a malformed username and anonymous callers", async () => {
    const t = createTest();
    const id = await seedUser(t, { email: "a@b.com", username: "rider" });

    await expect(
      t
        .withIdentity({ subject: id })
        .mutation(api.users.updateUsername, { username: "AB" }),
    ).rejects.toMatchObject({ data: expect.stringContaining("username") });

    await expect(
      t.mutation(api.users.updateUsername, { username: "fresh" }),
    ).rejects.toMatchObject({ data: "You must be signed in." });
  });
});

describe("setPassword", () => {
  it("enables a password for a signed-in user and links it to their account", async () => {
    const t = createTest();
    const id = await seedUser(t, {
      email: "rider@example.com",
      username: "rider",
      emailVerificationTime: 1,
    });

    await t
      .withIdentity({ subject: id })
      .action(api.users.setPassword, { password: "Passw0rd!" });

    const accounts = await t.run((ctx) =>
      ctx.db.query("authAccounts").collect(),
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      userId: id,
      provider: "password",
      providerAccountId: "rider@example.com",
    });
    expect(accounts[0].secret).not.toBe("Passw0rd!");
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
      1,
    );

    const me = await t.withIdentity({ subject: id }).query(api.users.me, {});
    expect(me?.hasPassword).toBe(true);
  });

  it("refuses to replace an existing password", async () => {
    const t = createTest();
    const id = await seedUser(t, {
      email: "rider@example.com",
      username: "rider",
    });
    await t.run((ctx) =>
      ctx.db.insert("authAccounts", {
        userId: id,
        provider: "password",
        providerAccountId: "rider@example.com",
        secret: "old-secret",
      }),
    );

    await expect(
      t
        .withIdentity({ subject: id })
        .action(api.users.setPassword, { password: "Passw0rd!" }),
    ).rejects.toMatchObject({ data: "You already have a password." });

    const accounts = await t.run((ctx) =>
      ctx.db.query("authAccounts").collect(),
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0].secret).toBe("old-secret");
  });

  it("rejects weak passwords and anonymous callers", async () => {
    const t = createTest();
    const id = await seedUser(t, {
      email: "rider@example.com",
      username: "rider",
    });

    await expect(
      t
        .withIdentity({ subject: id })
        .action(api.users.setPassword, { password: "short" }),
    ).rejects.toMatchObject({ data: "Invalid password." });

    await expect(
      t.action(api.users.setPassword, { password: "Passw0rd!" }),
    ).rejects.toMatchObject({ data: "You must be signed in." });
  });
});

describe("unlinkGoogle", () => {
  it("removes the Google account when a password exists", async () => {
    const t = createTest();
    const id = await seedUser(t, {
      email: "rider@example.com",
      username: "rider",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: id,
        provider: "password",
        providerAccountId: "rider@example.com",
      });
      await ctx.db.insert("authAccounts", {
        userId: id,
        provider: "google",
        providerAccountId: "g1",
      });
    });

    await t.withIdentity({ subject: id }).mutation(api.users.unlinkGoogle, {});

    const me = await t.withIdentity({ subject: id }).query(api.users.me, {});
    expect(me?.hasGoogle).toBe(false);
    expect(me?.hasPassword).toBe(true);
  });

  it("refuses to remove Google when it is the only sign-in method", async () => {
    const t = createTest();
    const id = await seedUser(t, {
      email: "rider@example.com",
      username: "rider",
    });
    await t.run((ctx) =>
      ctx.db.insert("authAccounts", {
        userId: id,
        provider: "google",
        providerAccountId: "g1",
      }),
    );

    await expect(
      t.withIdentity({ subject: id }).mutation(api.users.unlinkGoogle, {}),
    ).rejects.toMatchObject({
      data: "Set a password before disconnecting Google.",
    });
  });

  it("requires a password even when another non-password provider exists", async () => {
    const t = createTest();
    const id = await seedUser(t, {
      email: "rider@example.com",
      username: "rider",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: id,
        provider: "google",
        providerAccountId: "g1",
      });
      await ctx.db.insert("authAccounts", {
        userId: id,
        provider: "other",
        providerAccountId: "other1",
      });
    });

    await expect(
      t.withIdentity({ subject: id }).mutation(api.users.unlinkGoogle, {}),
    ).rejects.toMatchObject({
      data: "Set a password before disconnecting Google.",
    });
  });

  it("rejects anonymous callers", async () => {
    const t = createTest();

    await expect(t.mutation(api.users.unlinkGoogle, {})).rejects.toMatchObject({
      data: "You must be signed in.",
    });
  });
});

import { defineTestApp } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../convex/schema";
import * as users from "../convex/users";
import {
  createOrUpdateUser,
  googleProfile,
  passwordProfile,
  validatePasswordRequirements,
  type CreateOrUpdateUserArgs,
} from "../convex/auth";
import type { MutationCtx } from "../convex/_generated/server";
import { generatedAvatarUrl } from "../lib/avatar";

const { api, createTest } = defineTestApp({ schema }).defineModules({ users });

const provision = (
  t: ReturnType<typeof createTest>,
  args: CreateOrUpdateUserArgs,
) => t.run((ctx) => createOrUpdateUser(ctx as unknown as MutationCtx, args));

const seedUser = (
  t: ReturnType<typeof createTest>,
  doc: { email?: string; username?: string; emailVerificationTime?: number },
) => t.run((ctx) => ctx.db.insert("users", doc));

describe("createOrUpdateUser", () => {
  it("creates an unverified password user and generates an avatar", async () => {
    const t = createTest();
    const id = await provision(t, {
      existingUserId: null,
      type: "credentials",
      profile: { email: " Rider@Example.com ", username: "rider" },
    });

    const user = await t.run((ctx) => ctx.db.get(id));
    expect(user?.email).toBe("rider@example.com");
    expect(user?.username).toBe("rider");
    expect(user?.emailVerificationTime).toBeUndefined();
    expect(user?.image).toBe(generatedAvatarUrl("rider"));
  });

  it("refuses a password sign up for an email that already has a Google account", async () => {
    const t = createTest();
    await seedUser(t, { email: "rider@example.com", emailVerificationTime: 1 });

    await expect(
      provision(t, {
        existingUserId: null,
        type: "credentials",
        profile: { email: "rider@example.com", username: "rider2" },
      }),
    ).rejects.toMatchObject({
      data: "An account with this email already exists.",
    });
  });

  it("links a Google sign in to the existing password user instead of duplicating", async () => {
    const t = createTest();
    const id = await seedUser(t, {
      email: "rider@example.com",
      username: "rider",
    });

    const linkedId = await provision(t, {
      existingUserId: null,
      type: "oauth",
      profile: { email: "rider@example.com", name: "Rider" },
    });

    expect(linkedId).toBe(id);
    const user = await t.run((ctx) => ctx.db.get(id));
    expect(user?.emailVerificationTime).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
      1,
    );
  });

  it("refuses a username already taken by another user", async () => {
    const t = createTest();
    await seedUser(t, { email: "a@x.com", username: "rider" });

    await expect(
      provision(t, {
        existingUserId: null,
        type: "credentials",
        profile: { email: "b@x.com", username: "rider" },
      }),
    ).rejects.toMatchObject({ data: "That username is already taken." });
  });

  it("derives a username for OAuth sign in when none is provided", async () => {
    const t = createTest();
    const id = await provision(t, {
      existingUserId: null,
      type: "oauth",
      profile: { email: "neo@matrix.io" },
    });

    const user = await t.run((ctx) => ctx.db.get(id));
    expect(user?.username).toBe("neo");
  });

  it("derives a unique username when the derived one is taken", async () => {
    const t = createTest();
    await seedUser(t, { email: "taken@x.com", username: "neo" });

    const id = await provision(t, {
      existingUserId: null,
      type: "oauth",
      profile: { email: "neo@matrix.io" },
    });

    const user = await t.run((ctx) => ctx.db.get(id));
    expect(user?.username).toBe("neo1");
  });

  it("updates the existing user for a returning session", async () => {
    const t = createTest();
    const id = await seedUser(t, { email: "a@b.com", username: "ab" });

    const again = await provision(t, {
      existingUserId: id,
      type: "oauth",
      profile: { name: "New Name" },
    });

    expect(again).toBe(id);
    const user = await t.run((ctx) => ctx.db.get(id));
    expect(user?.name).toBe("New Name");
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(
      1,
    );
  });

  it("rejects an invalid email in the profile", async () => {
    const t = createTest();
    await expect(
      provision(t, {
        existingUserId: null,
        type: "oauth",
        profile: { email: "nope" },
      }),
    ).rejects.toMatchObject({ data: "Enter a valid email address." });
  });

  it("prefers a provider image over the generated avatar", async () => {
    const t = createTest();
    const id = await provision(t, {
      existingUserId: null,
      type: "oauth",
      profile: { email: "a@b.com", image: "https://img/p.png" },
    });

    const user = await t.run((ctx) => ctx.db.get(id));
    expect(user?.image).toBe("https://img/p.png");
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

  it("normalizes the email and strips default avatars", () => {
    const profile = googleProfile({
      sub: "1",
      email: " A@B.com ",
      picture: "https://x/default-user.png",
      email_verified: true,
    });
    expect(profile.email).toBe("a@b.com");
    expect(profile.image).toBeUndefined();

    expect(
      googleProfile({
        sub: "1",
        email: "a@b.com",
        picture: "https://x/p.png",
        email_verified: true,
      }).image,
    ).toBe("https://x/p.png");
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

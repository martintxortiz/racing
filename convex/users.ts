import {
  createAccount,
  getAuthSessionId,
  getAuthUserId,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { validatePasswordRequirements } from "./auth";
import { normalizeUsername, usernamePattern } from "../lib/auth-validation";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    const googleAccount = accounts.find(
      (account) => account.provider === "google",
    );
    return {
      username: user.username ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      hasPassword: accounts.some((account) => account.provider === "password"),
      hasGoogle: Boolean(googleAccount),
      googleEmail: googleAccount?.emailVerified ?? null,
    };
  },
});

export const isUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = normalizeUsername(username);
    if (!usernamePattern.test(normalized)) return false;

    return (
      (await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", normalized))
        .first()) === null
    );
  },
});

export const updateUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You must be signed in.");

    const normalized = normalizeUsername(username);
    if (!usernamePattern.test(normalized)) {
      throw new ConvexError(
        "Use 3–20 letters, numbers, or underscores for your username.",
      );
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .first();
    if (existing && existing._id !== userId) {
      throw new ConvexError("That username is already taken.");
    }

    await ctx.db.patch(userId, { username: normalized });
  },
});

export const updateAvatar = mutation({
  args: { image: v.string() },
  handler: async (ctx, { image }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You must be signed in.");

    if (!image.startsWith("data:image/") || image.length > 100_000) {
      throw new ConvexError("That image could not be saved.");
    }

    await ctx.db.patch(userId, { image });
  },
});

export const prepareGoogleLink = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!userId || !sessionId) throw new ConvexError("You must be signed in.");

    const requests = await ctx.db.query("googleLinkRequests").collect();
    const now = Date.now();
    if (requests.some((request) => request.requestedAt > now - 5 * 60_000)) {
      throw new ConvexError(
        "Another Google connection is in progress. Try again shortly.",
      );
    }
    for (const request of requests) await ctx.db.delete(request._id);
    await ctx.db.insert("googleLinkRequests", {
      userId,
      sessionId,
      requestedAt: now,
    });
  },
});

export const passwordState = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("User not found.");

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();

    return {
      email: user.email ?? null,
      providerAccountId:
        accounts.find((account) => account.provider === "password")
          ?.providerAccountId ?? null,
    };
  },
});

export const setPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You must be signed in.");

    validatePasswordRequirements(password);

    const { email, providerAccountId } = await ctx.runQuery(
      internal.users.passwordState,
      { userId },
    );
    if (!email) throw new ConvexError("Your account has no email address.");

    if (providerAccountId) {
      throw new ConvexError("You already have a password.");
    }

    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email },
    });
    if (user._id !== userId) {
      throw new ConvexError("Could not link the password to your account.");
    }
  },
});

export const unlinkGoogle = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("You must be signed in.");

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    const google = accounts.find((account) => account.provider === "google");
    if (!google) throw new ConvexError("Google is not connected.");
    if (!accounts.some((account) => account.provider === "password")) {
      throw new ConvexError("Set a password before disconnecting Google.");
    }

    await ctx.db.delete(google._id);
  },
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
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
    const providers = new Set(accounts.map((account) => account.provider));
    return {
      username: user.username ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      hasPassword: providers.has("password"),
      hasGoogle: providers.has("google"),
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

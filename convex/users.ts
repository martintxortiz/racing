import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { query } from "./_generated/server";
import { normalizeUsername, usernamePattern } from "../lib/auth-validation";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { username: user.username ?? null, email: user.email ?? null };
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

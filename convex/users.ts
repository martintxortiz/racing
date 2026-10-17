import { v } from "convex/values";

import { query } from "./_generated/server";

const usernamePattern = /^[a-z0-9_]{3,20}$/;

export const isUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = username.trim().toLowerCase();
    if (!usernamePattern.test(normalized)) return false;

    return (await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .first()) === null;
  },
});

import { v } from "convex/values";

import { query } from "./_generated/server";
import { normalizeUsername, usernamePattern } from "../lib/auth-validation";

export const isUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = normalizeUsername(username);
    if (!usernamePattern.test(normalized)) return false;

    return (await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .first()) === null;
  },
});

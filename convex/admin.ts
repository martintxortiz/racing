import { internalMutation } from "./_generated/server";

const accountTables = [
  "authAccounts",
  "authSessions",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
  "authRateLimits",
  "users",
] as const;

export const clearAllAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of accountTables) {
      for (const doc of await ctx.db.query(table).collect()) {
        await ctx.db.delete(doc._id);
      }
    }
  },
});

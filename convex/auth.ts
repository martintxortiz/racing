import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";

import type { DataModel, Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const usernamePattern = /^[a-z0-9_]{3,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PasswordProvider = Password<DataModel>({
  profile(params) {
    const email =
      typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    if (!emailPattern.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }

    if (params.flow !== "signUp") return { email };

    const username =
      typeof params.username === "string"
        ? params.username.trim().toLowerCase()
        : "";
    if (!usernamePattern.test(username)) {
      throw new ConvexError("Use 3–20 letters, numbers, or underscores for your username.");
    }

    return { email, username };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordProvider],
  callbacks: {
    async createOrUpdateUser(rawCtx, { existingUserId, profile }) {
      const ctx = rawCtx as unknown as MutationCtx;
      const username = profile.username;
      if (typeof username === "string") {
        const existing = await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", username))
          .first();
        if (existing && existing._id !== existingUserId) {
          throw new ConvexError("That username is already taken.");
        }
      }

      const userProfile: Partial<Pick<Doc<"users">, "email" | "username">> = {
        ...(typeof profile.email === "string" ? { email: profile.email } : {}),
        ...(typeof username === "string" ? { username } : {}),
      };

      if (existingUserId) {
        await ctx.db.patch(existingUserId, userProfile);
        return existingUserId;
      }

      return await ctx.db.insert("users", userProfile);
    },
  },
});

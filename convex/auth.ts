import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import {
  emailPattern,
  normalizeEmail,
  normalizeUsername,
  usernamePattern,
} from "../lib/auth-validation";
import type { DataModel, Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const PasswordProvider = Password<DataModel>({
  profile(params) {
    if (typeof params.password === "string" && params.password.length > 128) {
      throw new ConvexError("Invalid credentials.");
    }

    const email =
      typeof params.email === "string" ? normalizeEmail(params.email) : "";
    if (!emailPattern.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }

    if (params.flow !== "signUp") return { email };

    const username =
      typeof params.username === "string"
        ? normalizeUsername(params.username)
        : "";
    if (!usernamePattern.test(username)) {
      throw new ConvexError(
        "Use 3–20 letters, numbers, or underscores for your username.",
      );
    }

    return { email, username };
  },
  validatePasswordRequirements(password) {
    if (
      password.length < 8 ||
      password.length > 128 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      throw new ConvexError("Invalid password.");
    }
  },
});

async function deriveUniqueUsername(ctx: MutationCtx, email?: string) {
  const base = (email?.split("@")[0] ?? "user")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  const stem = (base.length >= 3 ? base : `user${base}`).slice(0, 20);

  let candidate = stem;
  for (let n = 1; ; n++) {
    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", candidate))
      .first();
    if (!taken) return candidate;
    const suffix = String(n);
    candidate = `${stem.slice(0, 20 - suffix.length)}${suffix}`;
  }
}

const GoogleProvider = Google({
  profile(profile) {
    if (
      profile.email_verified !== true ||
      typeof profile.email !== "string" ||
      !profile.email
    ) {
      throw new ConvexError("Google must provide a verified email address.");
    }

    return {
      id: profile.sub,
      name: profile.name,
      email: normalizeEmail(profile.email),
      image: profile.picture,
    };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GoogleProvider, PasswordProvider],
  callbacks: {
    async createOrUpdateUser(rawCtx, { existingUserId, type, profile }) {
      const ctx = rawCtx as unknown as MutationCtx;
      const email =
        typeof profile.email === "string"
          ? normalizeEmail(profile.email)
          : undefined;
      if (email && !emailPattern.test(email)) {
        throw new ConvexError("Enter a valid email address.");
      }

      const existingEmailUser = email
        ? await ctx.db
            .query("users")
            .withIndex("email", (q) => q.eq("email", email))
            .first()
        : null;
      const linkedUserId =
        existingUserId ??
        (type === "oauth" ? (existingEmailUser?._id ?? null) : null);
      if (existingEmailUser && existingEmailUser._id !== linkedUserId) {
        throw new ConvexError("An account with this email already exists.");
      }

      const currentUser = linkedUserId ? await ctx.db.get(linkedUserId) : null;

      let username =
        typeof profile.username === "string" ? profile.username : undefined;
      if (typeof username === "string") {
        const existing = await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", username))
          .first();
        if (existing && existing._id !== existingUserId) {
          throw new ConvexError("That username is already taken.");
        }
      } else if (!currentUser?.username) {
        username = await deriveUniqueUsername(ctx, email);
      }

      const userProfile: Partial<
        Pick<
          Doc<"users">,
          "email" | "username" | "name" | "image" | "emailVerificationTime"
        >
      > = {
        ...(email ? { email } : {}),
        ...(type === "oauth" ? { emailVerificationTime: Date.now() } : {}),
        ...(typeof username === "string" ? { username } : {}),
        ...(typeof profile.name === "string" ? { name: profile.name } : {}),
        ...(typeof profile.image === "string" ? { image: profile.image } : {}),
      };

      if (linkedUserId) {
        await ctx.db.patch(linkedUserId, userProfile);
        return linkedUserId;
      }

      return ctx.db.insert("users", userProfile);
    },
  },
});

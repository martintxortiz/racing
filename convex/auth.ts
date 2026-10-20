import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, type Value } from "convex/values";

import {
  emailPattern,
  normalizeEmail,
  normalizeUsername,
  usernamePattern,
} from "../lib/auth-validation";
import { generatedAvatarUrl } from "../lib/avatar";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function passwordProfile(params: Record<string, Value | undefined>) {
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
}

export function validatePasswordRequirements(password: string) {
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
}

export function googleProfile(profile: {
  sub: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  email_verified?: boolean;
}) {
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
    image:
      profile.picture && !profile.picture.includes("/default-user")
        ? profile.picture
        : undefined,
    emailVerified: true,
  };
}

const PasswordProvider = Password<DataModel>({
  profile: passwordProfile,
  validatePasswordRequirements,
});

const GoogleProvider = Google({
  profile: googleProfile,
});

export async function deriveUniqueUsername(ctx: MutationCtx, email?: string) {
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

export type CreateOrUpdateUserArgs = {
  existingUserId: Id<"users"> | null;
  type: "oauth" | "credentials" | "email" | "phone" | "verification";
  provider: { id: string };
  profile: Record<string, unknown>;
};

export async function createOrUpdateUser(
  ctx: MutationCtx,
  { existingUserId, type, provider, profile }: CreateOrUpdateUserArgs,
) {
  const email =
    typeof profile.email === "string"
      ? normalizeEmail(profile.email)
      : undefined;
  if (email && !emailPattern.test(email)) {
    throw new ConvexError("Enter a valid email address.");
  }

  const sessionUserId = type === "oauth" ? null : await getAuthUserId(ctx);
  const sessionUser = sessionUserId ? await ctx.db.get(sessionUserId) : null;
  const existingEmailUser = email
    ? await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first()
    : null;
  let requestedGoogleUserId: Id<"users"> | null = null;
  if (type === "oauth" && provider.id === "google") {
    const now = Date.now();
    const linkWindowStart = now - 5 * 60_000;
    const requests = await ctx.db.query("googleLinkRequests").collect();
    const pendingRequest = requests.find(
      (request) => request.requestedAt > linkWindowStart,
    );
    const expiredRequest = requests.find(
      (request) => request.requestedAt <= linkWindowStart,
    );
    const verifiers = (await ctx.db.query("authVerifiers").collect()).filter(
      (verifier) =>
        verifier.sessionId && verifier._creationTime > linkWindowStart,
    );
    if (
      expiredRequest &&
      verifiers.some(
        (verifier) => verifier.sessionId === expiredRequest.sessionId,
      )
    ) {
      throw new ConvexError("Google connection expired. Please try again.");
    }
    if (pendingRequest) {
      const matchingVerifiers = verifiers.filter(
        (verifier) => verifier.sessionId === pendingRequest.sessionId,
      );
      if (verifiers.length !== 1 || matchingVerifiers.length !== 1) {
        throw new ConvexError(
          "Finish one Google connection before starting another.",
        );
      }
      const session = await ctx.db.get(pendingRequest.sessionId);
      if (!session || session.expirationTime <= now) {
        throw new ConvexError("Google connection expired. Please try again.");
      }
      requestedGoogleUserId = pendingRequest.userId;
    }
  }
  if (
    requestedGoogleUserId &&
    existingUserId &&
    requestedGoogleUserId !== existingUserId
  ) {
    throw new ConvexError(
      "This Google account is connected to another account.",
    );
  }
  const linkedUserId =
    existingUserId ??
    (type === "oauth"
      ? requestedGoogleUserId
      : sessionUser && sessionUser.email === email
        ? sessionUser._id
        : null);

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
    if (existing && existing._id !== linkedUserId) {
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
  > = {};
  if (!currentUser?.email && email) userProfile.email = email;
  if (
    type === "oauth" &&
    (!currentUser?.email || currentUser.email === email)
  ) {
    userProfile.emailVerificationTime = Date.now();
  }
  if (username) userProfile.username = username;
  if (!currentUser?.name && typeof profile.name === "string") {
    userProfile.name = profile.name;
  }
  if (!currentUser?.image && typeof profile.image === "string") {
    userProfile.image = profile.image;
  }
  if (!currentUser?.image && !profile.image && username) {
    userProfile.image = generatedAvatarUrl(username);
  }

  if (linkedUserId) {
    await ctx.db.patch(linkedUserId, userProfile);
    if (requestedGoogleUserId === linkedUserId) {
      const requests = await ctx.db.query("googleLinkRequests").collect();
      for (const request of requests) await ctx.db.delete(request._id);
    }
    return linkedUserId;
  }
  return ctx.db.insert("users", userProfile);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GoogleProvider, PasswordProvider],
  callbacks: {
    async createOrUpdateUser(rawCtx, args) {
      return createOrUpdateUser(rawCtx as unknown as MutationCtx, args);
    },
  },
});

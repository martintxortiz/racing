import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    username: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_username", ["username"]),
  googleLinkRequests: defineTable({
    userId: v.id("users"),
    sessionId: v.id("authSessions"),
    requestedAt: v.number(),
  }).index("by_session", ["sessionId"]),
  events: defineTable({
    name: v.string(),
    dateStart: v.string(),
  }),
});

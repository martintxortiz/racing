import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";

function splitDateTime(value: string) {
  const offset = value.match(/(?:Z|[+-]\d{2}:\d{2})$/)?.[0];
  return {
    date: value.slice(0, 10),
    time: `${value.slice(11, 19)} ${offset && offset !== "Z" ? `GMT${offset}` : "UTC"}`,
  };
}

function toLibraryEvent(doc: Doc<"events">) {
  const { date, time } = splitDateTime(doc.dateStart);
  return {
    id: String(doc._id),
    name: doc.name,
    dateStart: doc.dateStart,
    startDate: date,
    startTime: time,
    sessions: [] as const,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const docs = await ctx.db.query("events").collect();
    return docs
      .map(toLibraryEvent)
      .sort((a, b) => Date.parse(b.dateStart) - Date.parse(a.dateStart));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const eventId = ctx.db.normalizeId("events", id);
    if (!eventId) return null;

    const doc = await ctx.db.get(eventId);
    if (!doc) return null;
    return toLibraryEvent(doc);
  },
});

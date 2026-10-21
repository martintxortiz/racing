import { defineTestApp } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../convex/schema";
import * as events from "../convex/events";
import * as authFunctions from "../convex/auth";

const { api, createTest } = defineTestApp({ schema }).defineModules({
  events,
  auth: authFunctions,
});

describe("events", () => {
  it("list returns empty when signed out", async () => {
    const t = createTest();
    await t.run((ctx) =>
      ctx.db.insert("events", {
        name: "Hidden",
        dateStart: "2026-03-15T14:00:00Z",
      }),
    );
    expect(await t.query(api.events.list, {})).toEqual([]);
  });

  it("list maps events with empty sessions", async () => {
    const t = createTest();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "a@b.com" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("events", {
        name: "Test GP",
        dateStart: "2026-03-15T14:00:00Z",
      }),
    );

    const rows = await t.withIdentity({ subject: userId }).query(api.events.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Test GP",
      dateStart: "2026-03-15T14:00:00Z",
      startDate: "2026-03-15",
      sessions: [],
    });
    expect(rows[0].startTime).toContain("14:00:00");
  });

  it("get returns null for bad ids", async () => {
    const t = createTest();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "a@b.com" }),
    );
    expect(
      await t.withIdentity({ subject: userId }).query(api.events.get, {
        id: "not-an-id",
      }),
    ).toBeNull();
  });
});

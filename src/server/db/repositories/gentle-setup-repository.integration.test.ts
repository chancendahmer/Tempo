import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { readGentleSetup, saveGentleSetup } from "./gentle-setup-repository";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { DrizzleConversationRepository } from "./conversation-repository";

describe("account workspace setup", () => {
  let client: PGlite, db: TempoDatabase, owner: string, neighbor: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
    const rows = await db.insert(schema.users).values([
      { phoneE164: "+12025550770", displayName: "Avery", coachingTone: "direct", profileInstructions: "Ask one question at a time.", timezone: "America/New_York", quietHoursStart: "22:00", quietHoursEnd: "08:00", proactiveOptIn: false, onboardingState: "timezone", optedOutAt: new Date("2026-10-01T12:00:00Z") },
      { phoneE164: "+12025550771" },
    ]).returning();
    [owner, neighbor] = rows.map(row => row.id);
  }, 30000);
  afterAll(async () => client.close());

  it("keeps existing account choices and supplies a gentle invitation until dismissed", async () => {
    expect(await readGentleSetup(owner, db)).toEqual({ displayName: "Avery", coachingTone: "direct", setupStatus: "new", showStreak: true, timezone: "America/New_York" });
    expect(await saveGentleSetup(owner, { action: "skip" }, db)).toMatchObject({ displayName: "Avery", coachingTone: "direct", setupStatus: "skipped" });
    // A fresh read, such as another tab or later sign-in, sees the dismissal.
    expect((await readGentleSetup(owner, db)).setupStatus).toBe("skipped");
    expect((await readGentleSetup(neighbor, db)).setupStatus).toBe("new");
  });

  it("saves real coaching preferences without changing consent, safety gates, or custom instructions", async () => {
    const saved = await saveGentleSetup(owner, { action: "save", displayName: "  Ave  ", coachingTone: "gentle", showStreak: false }, db);
    expect(saved).toEqual({ displayName: "Ave", coachingTone: "gentle", showStreak: false, setupStatus: "complete", timezone: "America/New_York" });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
    expect(user).toMatchObject({ profileInstructions: "Ask one question at a time.", timezone: "America/New_York", quietHoursStart: "22:00:00", quietHoursEnd: "08:00:00", proactiveOptIn: false, onboardingState: "timezone", optedOutAt: new Date("2026-10-01T12:00:00Z"), profileCompletedAt: null });
    expect(await db.select().from(schema.consentRecords)).toHaveLength(0);
    expect(await db.select().from(schema.scheduledActions)).toHaveLength(0);
    expect((await readGentleSetup(neighbor, db)).displayName).toBeNull();
  });

  it("supports later edits and partial saves without re-enabling hidden streaks", async () => {
    await db.update(schema.users).set({ workspacePreferences: { setupStatus: "complete", showStreak: false, futurePreference: "keep" } }).where(eq(schema.users.id, owner));
    await saveGentleSetup(owner, { action: "save", displayName: "Avery again" }, db);
    expect(await readGentleSetup(owner, db)).toMatchObject({ displayName: "Avery again", coachingTone: "gentle", showStreak: false, setupStatus: "complete" });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
    expect(user.workspacePreferences.futurePreference).toBe("keep");
    // Closing a reopened setup does not discard a completed setup or preferences.
    expect(await saveGentleSetup(owner, { action: "skip" }, db)).toMatchObject({ setupStatus: "complete", showStreak: false });
    expect(await saveGentleSetup(owner, { action: "save", displayName: "" }, db)).toMatchObject({ displayName: null, showStreak: false });
  });

  it("rejects unrecognized mutations and unavailable accounts without writing another account", async () => {
    const before = await readGentleSetup(neighbor, db);
    await expect(saveGentleSetup(neighbor, { action: "save", proactiveOptIn: true } as never, db)).rejects.toThrow();
    await expect(saveGentleSetup(neighbor, { action: "skip", displayName: "Sneaky" } as never, db)).rejects.toThrow();
    await expect(saveGentleSetup(neighbor, { action: "save", showStreak: "false" } as never, db)).rejects.toThrow();
    await expect(saveGentleSetup(randomUUID(), { action: "save", displayName: "Missing" }, db)).rejects.toThrow("account is unavailable");
    expect(await readGentleSetup(neighbor, db)).toEqual(before);
  });

  it("confirms one IANA time zone in shared account preferences without changing saved plans or safety choices", async () => {
    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
    const otherBefore = await readGentleSetup(neighbor, db);
    const [reminder] = await db.insert(schema.reminders).values({ userId: owner, text: "Keep the scheduled moment", remindAt: new Date("2026-10-23T14:00:00Z"), timezone: before.timezone, idempotencyKey: "timezone-test-reminder" }).returning();
    const saved = await saveGentleSetup(owner, { action: "timezone", timezone: "Europe/London" }, db, new Date("2026-10-22T15:00:00Z"));
    expect(saved).toMatchObject({ timezone: "Europe/London", timezoneConfirmedAt: "2026-10-22T15:00:00.000Z", setupStatus: before.workspacePreferences.setupStatus });
    expect((await readGentleSetup(owner, db)).timezone).toBe("Europe/London");
    const identity = await ensureDirectConversation(db, { userId: owner, phoneE164: before.phoneE164 });
    const [message] = await db.insert(schema.conversationMessages).values({ userId: owner, conversationId: identity.conversationId, direction: "inbound", kind: "user", status: "received", body: "Synthetic local-time context check" }).returning();
    expect(await new DrizzleConversationRepository(db).claimInbound(message.id, new Date("2026-10-22T15:01:00Z"))).toMatchObject({ timezone: "Europe/London", userId: owner });
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
    expect(after).toMatchObject({ timezone: "Europe/London", proactiveOptIn: before.proactiveOptIn, quietHoursStart: before.quietHoursStart, quietHoursEnd: before.quietHoursEnd, onboardingState: before.onboardingState, optedOutAt: before.optedOutAt, profileInstructions: before.profileInstructions });
    expect(after.workspacePreferences.futurePreference).toBe("keep");
    expect(await readGentleSetup(neighbor, db)).toEqual(otherBefore);
    expect((await db.select().from(schema.reminders).where(eq(schema.reminders.id, reminder.id)))[0]).toEqual(reminder);
    expect(await db.select().from(schema.scheduledActions)).toHaveLength(0);
    expect(await db.select().from(schema.consentRecords)).toHaveLength(0);
    await expect(saveGentleSetup(owner, { action: "timezone", timezone: "+04:00" }, db)).rejects.toThrow();
    expect((await readGentleSetup(owner, db)).timezone).toBe("Europe/London");
  });
});

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { evaluateUserContext } from "../../domain/context-evaluation-service";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import { calendarBusyWindows, calendarConnections, consentRecords, contextSnapshots, conversationMessages, interventionPolicies, interventions, lifeItems, scheduledActions, tasks, users } from "../schema";
import { DrizzleContextEngineRepository } from "./context-engine-repository";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { DrizzleInterventionRepository } from "./intervention-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";

describe("shadow context evaluation", () => {
  let client: PGlite;
  let database: TempoDatabase;

  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
  });
  afterAll(async () => client.close());

  it("uses the account's latest inbound across web and SMS, ignoring other accounts and outbound replies", async () => {
    const [owner, other] = await database.insert(users).values([{ phoneE164: "+12025550951" }, { phoneE164: "+12025550952" }]).returning();
    const ownerChat = await ensureDirectConversation(database, { userId: owner.id, phoneE164: owner.phoneE164 });
    const otherChat = await ensureDirectConversation(database, { userId: other.id, phoneE164: other.phoneE164 });
    const smsAt = new Date("2026-08-18T13:54:00Z");
    const webAt = new Date("2026-08-18T13:59:00Z");
    await database.insert(conversationMessages).values([
      { userId: owner.id, conversationId: ownerChat.conversationId, direction: "inbound", kind: "user", status: "processed", body: "SMS", createdAt: smsAt },
      { userId: owner.id, conversationId: ownerChat.conversationId, direction: "inbound", kind: "user", status: "received", body: "Web", idempotencyKey: `web-chat:${owner.id}:recent`, createdAt: webAt },
      { userId: owner.id, conversationId: ownerChat.conversationId, direction: "outbound", kind: "coach", status: "delivered", body: "Reply", createdAt: new Date("2026-08-18T14:00:00Z") },
      { userId: other.id, conversationId: otherChat.conversationId, direction: "inbound", kind: "user", status: "processed", body: "Other", createdAt: new Date("2026-08-18T14:01:00Z") },
    ]);
    const signals = await new DrizzleContextEngineRepository(database).loadSignals(owner.id, new Date("2026-08-18T14:02:00Z"));
    expect(signals?.lastUserMessageAt).toEqual(webAt);
  });

  it("persists reproducible decisions and never creates an outbound SMS", async () => {
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550174",
      status: "active",
      onboardingState: "complete",
      timezone: "UTC",
      proactiveOptIn: true,
    }).returning({ id: users.id });
    await database.insert(consentRecords).values({
      userId: user.id,
      status: "granted",
      channel: "web",
      disclosureVersion: "test",
      termsVersion: "test",
      privacyVersion: "test",
    });
    await database.insert(tasks).values({
      userId: user.id,
      title: "Submit report",
      estimatedMinutes: 30,
      dueAt: new Date("2026-08-18T16:00:00Z"),
    });
    await database.insert(calendarConnections).values({
      userId: user.id,
      encryptedRefreshToken: "test-only",
      scopes: ["freebusy"],
      lastSyncedAt: new Date("2026-08-18T13:55:00Z"),
    });
    const repository = new DrizzleContextEngineRepository(database);
    const result = await evaluateUserContext({
      userId: user.id,
      repository,
      shadowMode: true,
      now: new Date("2026-08-18T14:00:00Z"),
    });
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error("expected evaluation");
    expect(result.evaluation.decision).toBe("shadow");

    const [snapshot] = await database.select().from(contextSnapshots).where(eq(contextSnapshots.userId, user.id));
    expect(snapshot.reasonCodes).toContain("above_threshold_shadow");
    expect(snapshot.scoreBreakdown).toMatchObject({ taskUrgency: expect.any(Number), freeTime: expect.any(Number) });
    expect(snapshot.inputs).toMatchObject({ policyVersion: "context-v1.1.0", localTimeBucket: "afternoon" });
    expect(await database.select().from(conversationMessages).where(eq(conversationMessages.userId, user.id))).toHaveLength(0);

    await database.insert(interventions).values({
      userId: user.id,
      taskId: snapshot.taskId,
      contextSnapshotId: snapshot.id,
      style: "direct_nudge",
      status: "delivered",
      idempotencyKey: `test-intervention:${user.id}`,
    });
    const blocked = await evaluateUserContext({
      userId: user.id,
      repository,
      shadowMode: false,
      now: new Date("2026-08-18T14:30:00Z"),
    });
    expect(blocked.evaluated).toBe(true);
    if (!blocked.evaluated) throw new Error("expected evaluation");
    expect(blocked.evaluation.decision).toBe("blocked");
    expect(blocked.evaluation.reasonCodes).toEqual(expect.arrayContaining(["pending_response", "cooldown_active"]));
  });

  it("persists a reproducible holdout without scheduling delivery", async () => {
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550176", status: "active", onboardingState: "complete", timezone: "UTC", proactiveOptIn: true,
    }).returning({ id: users.id });
    await database.insert(consentRecords).values({
      userId: user.id, status: "granted", channel: "web", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test",
    });
    await database.insert(tasks).values({
      userId: user.id, title: "Urgent task", dueAt: new Date("2026-08-18T16:00:00Z"), estimatedMinutes: 30,
    });
    await database.insert(calendarConnections).values({
      userId: user.id,
      encryptedRefreshToken: "test-only",
      scopes: ["freebusy"],
      lastSyncedAt: new Date("2026-08-18T14:10:00Z"),
    });
    await database.update(interventionPolicies).set({ holdoutBasisPoints: 10_000 });
    const result = await evaluateUserContext({
      userId: user.id,
      repository: new DrizzleContextEngineRepository(database),
      planner: new DrizzleInterventionRepository(database),
      shadowMode: false,
      now: new Date("2026-08-18T14:15:00Z"),
    });
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error("expected evaluation");
    expect(result.evaluation.decision).toBe("holdout");
    const [intervention] = await database.select().from(interventions).where(eq(interventions.contextSnapshotId, result.snapshotId));
    expect(intervention.status).toBe("held_out");
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.interventionId, intervention.id))).toHaveLength(0);
  });

  it("calls the reviewer once and finalizes the reserved snapshot before scheduling the approved task", async () => {
    const now = new Date("2026-08-18T14:00:00Z");
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550955", timezone: "UTC", onboardingState: "complete", proactiveOptIn: true,
    }).returning();
    await database.insert(consentRecords).values({
      userId: user.id, status: "granted", channel: "web", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test",
    });
    await database.insert(calendarConnections).values({
      userId: user.id, encryptedRefreshToken: "test-only", scopes: ["freebusy"], lastSyncedAt: now,
    });
    await database.insert(tasks).values({
      userId: user.id, title: "Report", estimatedMinutes: 30, dueAt: new Date("2026-08-18T15:00:00Z"),
    });
    await database.update(interventionPolicies).set({ holdoutBasisPoints: 0 });
    const repository = new DrizzleContextEngineRepository(database);
    const review = vi.fn(async () => {
      const [pending] = await database.select().from(contextSnapshots).where(eq(contextSnapshots.userId, user.id));
      expect(pending).toMatchObject({ decision: "blocked", reasonCodes: expect.arrayContaining(["ai_review_pending"]) });
      return { send: true, reason: "Concrete eligible task", model: "fixture" };
    });
    const input = { userId: user.id, repository, shadowMode: false, planner: new DrizzleInterventionRepository(database), reviewer: { review } };
    const first = await evaluateUserContext({ ...input, now });
    await evaluateUserContext({ ...input, now: new Date("2026-08-18T14:05:00Z") });
    const [snapshot] = await database.select().from(contextSnapshots).where(eq(contextSnapshots.userId, user.id));
    expect(snapshot).toMatchObject({ decision: "send", reasonCodes: expect.arrayContaining(["ai_review_send"]) });
    expect(snapshot.reasonCodes).not.toContain("ai_review_pending");
    expect(review).toHaveBeenCalledOnce();
    expect(first).toMatchObject({ interventionId: expect.any(String) });
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).toHaveLength(1);
  });

  it("uses only the account's current workspace signals and persists no raw workspace content", async () => {
    const now = new Date("2026-08-18T14:00:00Z");
    const recent = new Date("2026-08-18T13:59:00Z");
    const stale = new Date("2026-08-17T13:59:00Z");
    const [owner, other] = await database.insert(users).values([
      { phoneE164: "+12025550953", timezone: "America/New_York", onboardingState: "complete", proactiveOptIn: true },
      { phoneE164: "+12025550954" },
    ]).returning();
    await database.insert(consentRecords).values({
      userId: owner.id, status: "granted", channel: "web", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test",
    });
    await database.insert(calendarConnections).values({
      userId: owner.id, encryptedRefreshToken: "test-only", scopes: ["freebusy"], lastSyncedAt: recent,
    });
    const [task] = await database.insert(tasks).values({
      userId: owner.id, title: "Report", estimatedMinutes: 30, dueAt: new Date("2026-08-18T15:00:00Z"),
    }).returning();
    const secretTitle = "Fixture private workspace content";
    const food = { kind: "food" as const, title: secretTitle, date: "2026-08-18", meal: "Breakfast" as const, calories: null, protein: null, carbs: null, fat: null, fiber: null };
    const workout = { kind: "workout" as const, title: secretTitle, date: "2026-08-18", minutes: 20, activity: "Walk" as const };
    const meal = { kind: "meal" as const, title: secretTitle, date: "2026-08-18", meal: "Breakfast" as const, ingredients: secretTitle };
    await database.insert(lifeItems).values([
      { id: randomUUID(), userId: other.id, data: { kind: "focus", title: secretTitle, remaining: 600, endsAt: "2026-08-18T14:10:00Z" }, updatedAt: recent },
      { id: randomUUID(), userId: other.id, data: { kind: "note", title: secretTitle, body: secretTitle, taskId: task.id }, updatedAt: recent },
      { id: randomUUID(), userId: owner.id, data: { ...workout, date: "2026-08-17" }, updatedAt: recent },
      { id: randomUUID(), userId: owner.id, data: { ...meal, date: "2026-08-19" }, updatedAt: recent },
      { id: randomUUID(), userId: owner.id, data: food, updatedAt: stale },
    ]);
    const repository = new DrizzleContextEngineRepository(database);
    const baseline = await repository.loadSignals(owner.id, now);
    expect(baseline?.workspace).toEqual({ focusUntil: null, latestActivityAt: null, routines: [], linkedThoughts: new Map() });

    for (const data of [meal, food, workout]) {
      const id = randomUUID();
      await database.insert(lifeItems).values({ id, userId: owner.id, data, updatedAt: recent });
      expect((await repository.loadSignals(owner.id, now))?.workspace?.latestActivityAt).toEqual(recent);
      await database.delete(lifeItems).where(eq(lifeItems.id, id));
    }
    await database.insert(lifeItems).values([
      { id: randomUUID(), userId: owner.id, data: { kind: "note", title: secretTitle, body: secretTitle, taskId: task.id }, updatedAt: recent },
      { id: randomUUID(), userId: owner.id, data: {
        kind: "routine", title: secretTitle, period: "morning", time: "10:00",
        steps: [{ id: randomUUID(), title: secretTitle, minutes: 20, completedOn: null }],
      }, updatedAt: stale },
    ]);
    const signals = await repository.loadSignals(owner.id, now);
    expect(signals?.workspace).toEqual({
      focusUntil: null, latestActivityAt: recent, linkedThoughts: new Map([[task.id, recent]]),
      routines: [{ time: "10:00", steps: [{ minutes: 20, completedOn: null }] }],
    });
    expect(JSON.stringify(signals)).not.toContain(secretTitle);
    const result = await evaluateUserContext({ userId: owner.id, repository, shadowMode: true, now });
    if (!result.evaluated) throw new Error("expected evaluation");
    const [snapshot] = await database.select().from(contextSnapshots).where(eq(contextSnapshots.id, result.snapshotId));
    expect(snapshot).toMatchObject({
      decision: "blocked", reasonCodes: ["below_threshold"],
      scoreBreakdown: { linkedThought: expect.any(Number), routineOverlap: -0.24, recentWorkspaceActivity: expect.any(Number) },
    });
    expect(JSON.stringify(snapshot)).not.toContain(secretTitle);

    const focusEnd = new Date("2026-08-18T14:10:00Z");
    await database.insert(lifeItems).values({
      id: randomUUID(), userId: owner.id, updatedAt: recent,
      data: { kind: "focus", title: secretTitle, taskId: task.id, remaining: 600, endsAt: focusEnd.toISOString() },
    });
    expect((await repository.loadSignals(owner.id, now))?.workspace?.focusUntil).toEqual(focusEnd);
    const blocked = await evaluateUserContext({ userId: owner.id, repository, shadowMode: false, now: new Date("2026-08-18T14:05:00Z") });
    expect(blocked.evaluated && blocked.evaluation.reasonCodes).toContain("active_focus");
    for (const invalidSync of [new Date(now.getTime() - 45 * 60_000 - 1), new Date(now.getTime() + 1)]) {
      await database.update(calendarConnections).set({ lastSyncedAt: invalidSync }).where(eq(calendarConnections.userId, owner.id));
      expect(await repository.loadSignals(owner.id, now)).toMatchObject({ calendarAvailable: false, freeMinutes: 0 });
    }
  });

  it.each([
    ["enabled", 0], ["opted_out", 1], ["quiet_hours", 2], ["focus", 3], ["calendar_busy", 4], ["another_contact", 5], ["task_changed", 6],
  ] as const)("rechecks %s after composition before committing provider submission", async (scenario, suffix) => {
    const now = new Date("2026-08-18T14:00:00Z");
    const [user] = await database.insert(users).values({
      phoneE164: `+1202555096${suffix}`, timezone: "UTC", onboardingState: "complete", proactiveOptIn: true, dailyInterventionCap: 1,
    }).returning();
    await database.insert(consentRecords).values({
      userId: user.id, status: "granted", channel: "web", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test",
    });
    const [calendar] = await database.insert(calendarConnections).values({
      userId: user.id, encryptedRefreshToken: "test-only", scopes: ["freebusy"], lastSyncedAt: now,
    }).returning();
    const [task] = await database.insert(tasks).values({
      userId: user.id, title: "Report", estimatedMinutes: 30, dueAt: new Date("2026-08-18T15:00:00Z"),
    }).returning();
    const repository = new DrizzleContextEngineRepository(database);
    const initial = await evaluateUserContext({ userId: user.id, repository, shadowMode: true, now });
    if (!initial.evaluated) throw new Error("expected evaluation");
    const intervention = new DrizzleInterventionRepository(database);
    const id = await intervention.plan({
      userId: user.id, taskId: task.id, snapshotId: initial.snapshotId, style: "micro_start", decision: "send", now,
    });
    expect(await intervention.claimDelivery(id, now)).toMatchObject({ claimed: true });
    const body = "Give the report two minutes?";
    const context = await intervention.getDeliveryContext(id);
    if (!context) throw new Error("expected delivery context");
    await intervention.markQueued(id, body, context.draftVersion, "test");
    // The claimed reservation is visible to other candidates, but its own final
    // check can still proceed when it is the only contact on a one-per-day cap.
    expect((await repository.loadSignals(user.id, now))?.hasPendingResponse).toBe(true);
    expect(await intervention.canSubmitDelivery(id, user.id, now, context.draftVersion)).toBe(true);

    switch (scenario) {
      case "opted_out":
        await database.update(users).set({ proactiveOptIn: false }).where(eq(users.id, user.id));
        break;
      case "quiet_hours":
        await database.update(users).set({ quietHoursStart: "13:00", quietHoursEnd: "15:00" }).where(eq(users.id, user.id));
        break;
      case "focus":
        await database.insert(lifeItems).values({
          id: randomUUID(), userId: user.id, updatedAt: now,
          data: { kind: "focus", title: "Focus", taskId: task.id, remaining: 600, endsAt: "2026-08-18T14:10:00Z" },
        });
        break;
      case "calendar_busy":
        await database.insert(calendarBusyWindows).values({
          userId: user.id, connectionId: calendar.id, startsAt: now, endsAt: new Date("2026-08-18T14:10:00Z"), sourceHash: "fixture",
        });
        break;
      case "another_contact":
        await database.insert(interventions).values({
          userId: user.id, taskId: task.id, contextSnapshotId: initial.snapshotId, style: "micro_start", status: "delivered",
          idempotencyKey: `fixture-other-contact:${user.id}`, createdAt: new Date("2026-08-16T14:00:00Z"), sentAt: now,
        });
        break;
      case "task_changed":
        await database.update(tasks).set({ title: "A different task" }).where(eq(tasks.id, task.id));
        expect(await intervention.getDeliveryContext(id)).toMatchObject({ staleDraft: true });
        break;
    }
    const transport = new TestSmsTransport(`GATE-${suffix}`);
    const outbound = new DrizzleOutboundMessageRepository(database, (transaction, userId) =>
      new DrizzleInterventionRepository(transaction).canSubmitDelivery(id, userId, now, context.draftVersion));
    const sender = new SafeSmsSender(outbound, transport, () => now);
    const message = { userId: user.id, body, kind: "coach" as const, relatedInterventionId: id, idempotencyKey: `intervention-sms:${id}` };
    if (scenario === "enabled") {
      expect(await sender.send(message)).toMatchObject({ sent: true });
      expect(await sender.send(message)).toMatchObject({ sent: false, reason: "duplicate" });
      expect(transport.sent).toHaveLength(1);
    } else {
      expect(await sender.send(message)).toMatchObject({ sent: false, reason: "suppressed" });
      const [stored] = await database.select().from(conversationMessages).where(eq(conversationMessages.idempotencyKey, message.idempotencyKey));
      expect(stored).toMatchObject({ status: "cancelled", outboundState: "suppressed" });
      expect(transport.sent).toHaveLength(0);
    }
  });
});

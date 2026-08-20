import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutcomeTracker } from "../../domain/outcome-tracker";
import { executeReminderCommand } from "../../domain/reminder-service";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import {
  contextSnapshots,
  conversationMessages,
  interventionAccountability,
  interventionPolicies,
  interventions,
  reminders,
  scheduledActions,
  tasks,
  users,
} from "../schema";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { DrizzleInterventionRepository } from "./intervention-repository";
import { DrizzleOutcomeRepository } from "./outcome-repository";
import { DrizzleReminderRepository } from "./reminder-repository";

describe("hybrid reminder and accountability infrastructure", () => {
  let client: PGlite;
  let database: TempoDatabase;

  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
  }, 15_000);

  afterAll(async () => client.close());

  async function createUser(phone: string) {
    const [user] = await database.insert(users).values({
      phoneE164: phone,
      onboardingState: "complete",
      timezone: "America/New_York",
      interventionCooldownMinutes: 5,
    }).returning({ id: users.id });
    const conversationId = (await ensureDirectConversation(database, { userId: user.id, phoneE164: phone })).conversationId;
    return { userId: user.id, conversationId };
  }

  async function createIntervention(userId: string, taskId: string, suffix: string, status: "candidate" | "sent" = "candidate") {
    let [policy] = await database.select({ id: interventionPolicies.id }).from(interventionPolicies).limit(1);
    if (!policy) {
      [policy] = await database.insert(interventionPolicies).values({
        version: "hybrid-test", active: true, threshold: 0.6, holdoutBasisPoints: 0, weights: {}, settings: {},
      }).returning({ id: interventionPolicies.id });
    }
    const [snapshot] = await database.insert(contextSnapshots).values({
      userId, taskId, policyId: policy.id, decision: "send", score: 0.8,
      opportunityKey: `hybrid:${suffix}`, reasonCodes: ["above_threshold"], inputs: {}, scoreBreakdown: {},
    }).returning({ id: contextSnapshots.id });
    const [intervention] = await database.insert(interventions).values({
      userId, taskId, contextSnapshotId: snapshot.id, style: "micro_start", status,
      idempotencyKey: `hybrid-intervention:${suffix}`, ...(status === "sent" ? { sentAt: new Date() } : {}),
    }).returning({ id: interventions.id });
    return intervention.id;
  }

  it("stores an explicit reminder and a durable due action tied to the original message", async () => {
    const { userId, conversationId } = await createUser("+12025550201");
    const [source] = await database.insert(conversationMessages).values({
      userId, conversationId, direction: "inbound", kind: "user", status: "processing",
      body: "Remind me tomorrow at 10 PM to submit the report",
    }).returning({ id: conversationMessages.id });
    const now = new Date("2026-08-20T12:00:00Z");
    const remindAt = "2026-08-21T22:00:00-04:00";
    const repository = new DrizzleReminderRepository(database);
    expect(await executeReminderCommand(repository, {
      type: "create_reminder", text: "submit the report", remindAt,
    }, { userId, sourceMessageId: source.id, timezone: "America/New_York", now })).toContain("10:00 PM EDT");

    const [stored] = await database.select().from(reminders).where(eq(reminders.sourceMessageId, source.id));
    const [action] = await database.select().from(scheduledActions).where(eq(scheduledActions.reminderId, stored.id));
    expect(stored).toMatchObject({ status: "scheduled", text: "submit the report", remindAt: new Date("2026-08-22T02:00:00Z") });
    expect(action).toMatchObject({ kind: "deliver_reminder", status: "scheduled", runAt: stored.remindAt });
  });

  it("persists Give me 15 and resolves the second commitment into task progress", async () => {
    const { userId, conversationId } = await createUser("+12025550202");
    const [task] = await database.insert(tasks).values({ userId, title: "Finish report" }).returning({ id: tasks.id });
    const interventionId = await createIntervention(userId, task.id, "accountability", "sent");
    await new DrizzleInterventionRepository(database).startAccountability(interventionId);
    const [snoozeMessage] = await database.insert(conversationMessages).values({
      userId, conversationId, direction: "inbound", kind: "user", status: "processing", body: "Give me 15",
    }).returning({ id: conversationMessages.id });
    const now = new Date();
    const tracker = new OutcomeTracker(new DrizzleOutcomeRepository(database));
    expect(await tracker.tryHandleStandaloneReply({ userId, messageId: snoozeMessage.id, body: "Give me 15", now }))
      .toContain("15 minutes");
    const [snoozed] = await database.select().from(interventionAccountability)
      .where(eq(interventionAccountability.interventionId, interventionId));
    const [followup] = await database.select().from(scheduledActions).where(eq(scheduledActions.interventionId, interventionId));
    expect(snoozed).toMatchObject({ status: "snoozed", initialResponseMessageId: snoozeMessage.id });
    expect(followup).toMatchObject({ kind: "accountability_followup", status: "scheduled" });
    expect(followup.runAt.getTime() - now.getTime()).toBe(15 * 60_000);

    const interventionsRepository = new DrizzleInterventionRepository(database);
    expect(await interventionsRepository.getAccountabilityFollowupContext(interventionId, followup.runAt)).toMatchObject({ userId });
    await interventionsRepository.markAccountabilityFollowupSent(interventionId, followup.runAt);
    const [startMessage] = await database.insert(conversationMessages).values({
      userId, conversationId, direction: "inbound", kind: "user", status: "processing",
      body: "I told myself I would do it, starting now.",
    }).returning({ id: conversationMessages.id });
    const startAt = new Date(followup.runAt.getTime() + 60_000);
    expect(await tracker.tryHandleStandaloneReply({
      userId, messageId: startMessage.id, body: "I told myself I would do it, starting now.", now: startAt,
    })).toContain("commitment");
    const [progressedTask] = await database.select().from(tasks).where(eq(tasks.id, task.id));
    const [resolved] = await database.select().from(interventionAccountability)
      .where(eq(interventionAccountability.interventionId, interventionId));
    const [storedIntervention] = await database.select().from(interventions).where(eq(interventions.id, interventionId));
    expect(progressedTask.status).toBe("in_progress");
    expect(resolved).toMatchObject({ status: "started", followupResponseMessageId: startMessage.id });
    expect(storedIntervention.status).toBe("responded");
  });

  it("atomically prevents a second proactive intervention inside the five-minute floor", async () => {
    const { userId } = await createUser("+12025550203");
    const [task] = await database.insert(tasks).values({ userId, title: "Review notes" }).returning({ id: tasks.id });
    const first = await createIntervention(userId, task.id, "cooldown-first");
    const second = await createIntervention(userId, task.id, "cooldown-second");
    const repository = new DrizzleInterventionRepository(database);
    expect(await repository.claimDelivery(first)).toMatchObject({ claimed: true, cooldownMinutes: 5 });
    expect(await repository.claimDelivery(second)).toEqual({ claimed: false, reason: "cooldown_active" });
  });
});

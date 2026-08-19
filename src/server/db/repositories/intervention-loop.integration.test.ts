import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryService } from "../../domain/memory-service";
import { OutcomeTracker } from "../../domain/outcome-tracker";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import {
  contextSnapshots,
  consentRecords,
  conversationMessages,
  interventionOutcomes,
  interventionPolicies,
  interventions,
  memoryEntries,
  scheduledActions,
  tasks,
  taskEvents,
  users,
} from "../schema";
import { DrizzleInterventionRepository } from "./intervention-repository";
import { DrizzleMessagingRepository } from "./messaging-repository";
import { DrizzleMemoryRepository } from "./memory-repository";
import { DrizzleOutcomeRepository } from "./outcome-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";

describe("intervention, outcome, and memory loop", () => {
  let client: PGlite;
  let database: TempoDatabase;
  let userId: string;
  let taskId: string;
  let policyId: string;

  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550175", onboardingState: "complete", timezone: "UTC",
    }).returning({ id: users.id });
    userId = user.id;
    await database.insert(consentRecords).values({
      userId, status: "granted", channel: "web", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test",
    });
    const [task] = await database.insert(tasks).values({ userId, title: "Write report" }).returning({ id: tasks.id });
    taskId = task.id;
    const [policy] = await database.insert(interventionPolicies).values({
      version: "loop-test", active: true, threshold: 0.5, holdoutBasisPoints: 1000,
      weights: {}, settings: {},
    }).returning({ id: interventionPolicies.id });
    policyId = policy.id;
  });
  afterAll(async () => client.close());

  async function snapshot(suffix: string) {
    const [row] = await database.insert(contextSnapshots).values({
      userId, taskId, policyId, decision: "send", score: 0.8,
      opportunityKey: `loop:${suffix}`, reasonCodes: ["above_threshold"], inputs: {}, scoreBreakdown: {},
    }).returning({ id: contextSnapshots.id });
    return row.id;
  }

  it("records holdouts without delivery and plans each send exactly once", async () => {
    const repository = new DrizzleInterventionRepository(database);
    const heldOutId = await repository.plan({
      snapshotId: await snapshot("holdout"), userId, taskId, style: "micro_start", decision: "holdout", now: new Date(),
    });
    const sendSnapshot = await snapshot("send");
    const sendId = await repository.plan({
      snapshotId: sendSnapshot, userId, taskId, style: "direct_nudge", decision: "send", now: new Date(),
    });
    expect(await repository.plan({
      snapshotId: sendSnapshot, userId, taskId, style: "direct_nudge", decision: "send", now: new Date(),
    })).toBe(sendId);
    const [heldOut] = await database.select().from(interventions).where(eq(interventions.id, heldOutId));
    expect(heldOut.status).toBe("held_out");
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.interventionId, heldOutId))).toHaveLength(0);
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.interventionId, sendId))).toHaveLength(1);
  });

  it("recovers a provider submission after a worker crash before intervention finalization", async () => {
    const repository = new DrizzleInterventionRepository(database);
    const interventionId = await repository.plan({
      snapshotId: await snapshot("delivery-recovery"), userId, taskId,
      style: "micro_start", decision: "send", now: new Date("2026-08-18T12:00:00Z"),
    });
    await repository.markQueued(interventionId, "Take the first two-minute step?", "test", "test");
    const transport = new TestSmsTransport("RECOVERY");
    const sent = await new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport).send({
      userId,
      body: "Take the first two-minute step?",
      kind: "coach",
      idempotencyKey: `intervention-sms:${interventionId}`,
      relatedInterventionId: interventionId,
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });
    expect(sent.sent).toBe(true);

    const recovery = await repository.reconcileDelivery(interventionId);
    expect(recovery).toMatchObject({ kind: "submitted", userId, style: "micro_start" });
    const [stored] = await database.select().from(interventions).where(eq(interventions.id, interventionId));
    expect(stored).toMatchObject({ status: "sent", provider: "test", providerMessageSid: "RECOVERY000001" });
    expect(transport.sent).toHaveLength(1);
  });

  it("preserves a delivered callback that races intervention finalization", async () => {
    const repository = new DrizzleInterventionRepository(database);
    const interventionId = await repository.plan({
      snapshotId: await snapshot("delivery-race"), userId, taskId,
      style: "micro_start", decision: "send", now: new Date("2026-08-18T12:10:00Z"),
    });
    const body = "Take the first two-minute step?";
    await repository.markQueued(interventionId, body, "test", "test");
    const transport = new TestSmsTransport("RACE");
    const sent = await new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport).send({
      userId,
      body,
      kind: "coach",
      idempotencyKey: `intervention-sms:${interventionId}`,
      relatedInterventionId: interventionId,
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });
    expect(sent.sent).toBe(true);
    if (!sent.sent) throw new Error("Expected simulated delivery");
    await new DrizzleMessagingRepository(database).updateDelivery({
      provider: sent.provider, providerMessageId: sent.providerMessageSid,
      status: "delivered",
    });

    expect(await repository.markSent(interventionId, sent.providerMessageSid, new Date("2026-08-18T12:11:00Z")))
      .toBe("delivered");
    const [stored] = await database.select().from(interventions).where(eq(interventions.id, interventionId));
    expect(stored).toMatchObject({ status: "delivered", deliveredAt: expect.any(Date) });
  });

  it("attributes outcomes, learns only after repeated evidence, and supersedes old learning", async () => {
    const outcomes = new DrizzleOutcomeRepository(database);
    const messageRows = await database.insert(conversationMessages).values([1, 2, 3].map((index) => ({
      userId, direction: "inbound" as const, kind: "user" as const, status: "processed" as const,
      body: index < 3 ? "That helped" : "Wrong nudge",
    }))).returning({ id: conversationMessages.id });

    for (let index = 0; index < 3; index += 1) {
      const [intervention] = await database.insert(interventions).values({
        userId, taskId, contextSnapshotId: await snapshot(`outcome-${index}`), style: "body_doubling",
        status: "sent", idempotencyKey: `outcome-intervention:${index}`,
        sentAt: new Date(`2026-08-18T1${index}:00:00Z`),
      }).returning({ id: interventions.id });
      await outcomes.record({
        interventionId: intervention.id,
        sourceMessageId: messageRows[index].id,
        source: "explicit_reply",
        startedAt: new Date(`2026-08-18T1${index}:05:00Z`),
        helpful: index < 2,
        now: new Date(`2026-08-18T1${index}:05:00Z`),
      });
      if (index === 0) {
        expect(await database.select().from(memoryEntries).where(eq(memoryEntries.userId, userId))).toHaveLength(0);
      }
    }

    const active = await database.select().from(memoryEntries).where(and(eq(memoryEntries.userId, userId), isNull(memoryEntries.deletedAt)));
    const superseded = await database.select().from(memoryEntries).where(and(eq(memoryEntries.userId, userId), isNotNull(memoryEntries.deletedAt)));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ category: "intervention_learning", evidenceCount: 3, sourceMessageId: messageRows[2].id });
    expect(superseded).toHaveLength(1);
    expect(superseded[0].supersededById).toBe(active[0].id);
    expect(await database.select().from(interventionOutcomes)).toHaveLength(3);
    const [progressedTask] = await database.select().from(tasks).where(eq(tasks.id, taskId));
    expect(progressedTask).toMatchObject({ status: "in_progress", startedAt: expect.any(Date) });
    const progressEvents = await database.select().from(taskEvents).where(eq(taskEvents.taskId, taskId));
    expect(progressEvents.filter((event) => event.eventType === "started")).toHaveLength(1);
    expect(progressEvents.find((event) => event.eventType === "started")?.sourceMessageId).toBe(messageRows[0].id);
    const [user] = await database.select({ responseStats: users.responseStats }).from(users).where(eq(users.id, userId));
    expect(user.responseStats).toMatchObject({ byTimeBucket: expect.any(Object), helpfulRate: 2 / 3 });
  });

  it("lets the user supersede and delete remembered preferences", async () => {
    const [source] = await database.insert(conversationMessages).values({
      userId, direction: "inbound", kind: "user", status: "processed", body: "Actually, I prefer gentle reminders",
    }).returning({ id: conversationMessages.id });
    const service = new MemoryService(new DrizzleMemoryRepository(database));
    expect(await service.tryHandleCorrection({
      userId, messageId: source.id, body: "Actually, I prefer gentle reminders", now: new Date("2026-08-18T15:00:00Z"),
    })).toContain("going forward");
    expect(await service.tryHandleCorrection({
      userId, messageId: source.id, body: "forget gentle reminders", now: new Date("2026-08-18T15:01:00Z"),
    })).toBe("Forgot it.");
    const preferences = await database.select().from(memoryEntries).where(and(eq(memoryEntries.userId, userId), eq(memoryEntries.category, "preference")));
    expect(preferences).toHaveLength(1);
    expect(preferences[0].deletedAt).toBeInstanceOf(Date);
  });

  it("confirms a concrete reschedule and traces the due-date change to the reply", async () => {
    const proposedAt = new Date("2026-08-19T17:00:00Z");
    const [rescheduleSnapshot] = await database.insert(contextSnapshots).values({
      userId, taskId, policyId, decision: "send", score: 0.8,
      opportunityKey: "loop:reschedule", reasonCodes: ["above_threshold"],
      inputs: { nextFreeAt: proposedAt.toISOString() }, scoreBreakdown: {},
    }).returning({ id: contextSnapshots.id });
    const [intervention] = await database.insert(interventions).values({
      userId, taskId, contextSnapshotId: rescheduleSnapshot.id, style: "reschedule",
      status: "sent", idempotencyKey: "reschedule-confirmation", sentAt: new Date("2026-08-18T16:00:00Z"),
    }).returning({ id: interventions.id });
    const [replyMessage] = await database.insert(conversationMessages).values({
      userId, direction: "inbound", kind: "user", status: "processing", body: "YES",
    }).returning({ id: conversationMessages.id });
    const reply = await new OutcomeTracker(new DrizzleOutcomeRepository(database)).tryHandleStandaloneReply({
      userId, messageId: replyMessage.id, body: "YES", now: new Date("2026-08-18T16:01:00Z"),
    });
    expect(reply).toContain("Moved Write report");
    const [task] = await database.select().from(tasks).where(eq(tasks.id, taskId));
    expect(task.dueAt).toEqual(proposedAt);
    const [event] = await database.select().from(taskEvents).where(eq(taskEvents.sourceMessageId, replyMessage.id));
    expect(event).toMatchObject({ taskId, eventType: "updated" });
    const [storedIntervention] = await database.select().from(interventions).where(eq(interventions.id, intervention.id));
    expect(storedIntervention.status).toBe("responded");
  });
});


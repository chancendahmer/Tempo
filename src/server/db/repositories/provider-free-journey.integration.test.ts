import { Buffer } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { TaskIntentParser } from "../../adapters/llm/task-intent-parser";
import { recordWebConsent } from "../../domain/consent";
import { ConversationOrchestrator } from "../../domain/conversation-orchestrator";
import { evaluateUserContext } from "../../domain/context-evaluation-service";
import { fallbackIntervention } from "../../domain/intervention-strategy";
import { OutcomeTracker } from "../../domain/outcome-tracker";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { createSecureActionLinks } from "../../security/action-links";
import { ScheduledActionRepository } from "../../jobs/scheduled-action-repository";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import {
  consentRecords,
  contextSnapshots,
  conversationMessages,
  interventionOutcomes,
  interventionPolicies,
  interventions,
  scheduledActions,
  taskEvents,
  tasks,
  users,
} from "../schema";
import { DrizzleConsentRepository } from "./consent-repository";
import { DrizzleGoalRepository } from "./goal-repository";
import { DrizzleSchedulingRepository } from "./scheduling-repository";
import { DrizzleContextEngineRepository } from "./context-engine-repository";
import { DrizzleConversationRepository } from "./conversation-repository";
import { DrizzleInterventionRepository } from "./intervention-repository";
import { DrizzleMessagingRepository } from "./messaging-repository";
import { DrizzleOutcomeRepository } from "./outcome-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";
import { DrizzleTaskRepository } from "./task-repository";

describe("provider-free V1 journey", () => {
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

  it("traces consent through onboarding, intervention delivery, progress, and helpful feedback", async () => {
    const consent = await recordWebConsent(
      new DrizzleConsentRepository(database),
      {
        countryCode: "US",
        callingCode: "+1",
        areaCode: "202",
        subscriberNumber: "5550199",
        consent: true,
      },
      { ip: "203.0.113.10", userAgent: "Tempo acceptance test", auditKey: "acceptance-audit-key" },
    );
    const [storedConsent] = await database.select().from(consentRecords).where(eq(consentRecords.userId, consent.userId));
    expect(storedConsent).toMatchObject({ status: "granted", channel: "web" });
    expect(storedConsent.sourceIpHash).not.toBe("203.0.113.10");

    const transport = new TestSmsTransport("JOURNEY");
    let now = new Date("2026-08-18T16:00:00Z");
    const outcomes = new OutcomeTracker(new DrizzleOutcomeRepository(database));
    const parser: TaskIntentParser = {
      parse: vi.fn(async () => ({ kind: "conversation" as const, reply: "Tell me what you want to do next." })),
    };
    const coach = new ConversationOrchestrator(
      new DrizzleConversationRepository(database),
      new DrizzleTaskRepository(database),
      new DrizzleGoalRepository(database),
      new DrizzleSchedulingRepository(database),
      parser,
      new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport, () => now),
      () => now,
      outcomes,
      undefined,
      createSecureActionLinks("https://tempo.example", Buffer.alloc(32, 7).toString("base64")),
    );

    let inboundSequence = 0;
    async function reply(body: string) {
      inboundSequence += 1;
      const sid = `SMJOURNEY${String(inboundSequence).padStart(4, "0")}`;
      expect(await new DrizzleMessagingRepository(database).ingestInbound({
        provider: "twilio", providerMessageId: sid,
        from: "+12025550199",
        to: "+12025550000",
        body: body,
      })).toEqual({ duplicate: false });
      const [message] = await database.select().from(conversationMessages)
        .where(eq(conversationMessages.providerMessageSid, sid));
      expect(await coach.process(message.id)).toEqual({ processed: true });
      return message;
    }

    await reply("I need to submit my lab report");
    now = new Date("2026-08-18T16:01:00Z");
    await reply("Eastern");
    now = new Date("2026-08-18T16:02:00Z");
    await reply("11pm to 7am");
    now = new Date("2026-08-18T16:03:00Z");
    await reply("direct");
    expect(transport.sent.at(-1)?.body).toContain("/api/auth/google/start?token=");
    now = new Date("2026-08-18T16:04:00Z");
    await reply("not now");

    const [onboardedUser] = await database.select().from(users).where(eq(users.id, consent.userId));
    const [task] = await database.select().from(tasks).where(eq(tasks.userId, consent.userId));
    expect(onboardedUser).toMatchObject({
      onboardingState: "complete",
      timezone: "America/New_York",
      coachingTone: "direct",
    });
    expect(task.title).toBe("submit my lab report");

    const evaluationTime = new Date("2026-08-18T18:00:00Z");
    await database.update(tasks).set({ dueAt: new Date("2026-08-18T17:00:00Z"), estimatedMinutes: 45 })
      .where(eq(tasks.id, task.id));
    const contextRepository = new DrizzleContextEngineRepository(database);
    await contextRepository.getActivePolicy();
    await database.update(interventionPolicies).set({ holdoutBasisPoints: 0 }).where(eq(interventionPolicies.active, true));
    const interventionRepository = new DrizzleInterventionRepository(database);
    const evaluation = await evaluateUserContext({
      userId: consent.userId,
      repository: contextRepository,
      planner: interventionRepository,
      shadowMode: false,
      now: evaluationTime,
    });
    expect(evaluation.evaluated).toBe(true);
    if (!evaluation.evaluated) throw new Error("Expected context evaluation");
    expect(evaluation.evaluation).toMatchObject({ decision: "send", task: { id: task.id } });
    expect(evaluation.interventionId).toBeTruthy();

    const interventionId = evaluation.interventionId!;
    const [deliveryAction] = await database.select().from(scheduledActions).where(and(
      eq(scheduledActions.interventionId, interventionId),
      eq(scheduledActions.kind, "deliver_intervention"),
    ));
    const actions = new ScheduledActionRepository(database);
    expect(await actions.markRunning(deliveryAction.id)).toBe(true);
    const deliveryContext = await interventionRepository.getDeliveryContext(interventionId);
    expect(deliveryContext).not.toBeNull();
    const interventionBody = fallbackIntervention({
      style: deliveryContext!.style,
      taskTitle: deliveryContext!.taskTitle,
      dueAt: deliveryContext!.dueAt,
      estimatedMinutes: deliveryContext!.estimatedMinutes,
      freeMinutes: 0,
      nextFreeAt: null,
      timezone: onboardedUser.timezone,
      tone: deliveryContext!.coachingTone,
      memories: [],
    });
    await interventionRepository.markQueued(interventionId, interventionBody, "journey-test-v1", "deterministic-fallback");
    const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport, () => evaluationTime);
    const sent = await sender.send({
      userId: consent.userId,
      body: interventionBody,
      kind: "coach",
      idempotencyKey: `intervention-sms:${interventionId}`,
      relatedInterventionId: interventionId,
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });
    expect(sent.sent).toBe(true);
    if (!sent.sent) throw new Error("Expected simulated intervention delivery");
    await interventionRepository.markSent(interventionId, sent.providerMessageSid, evaluationTime);
    await actions.completeAndScheduleFeedback(
      deliveryAction.id,
      consent.userId,
      interventionId,
      new Date(evaluationTime.getTime() + 45 * 60_000),
    );
    expect(await sender.send({
      userId: consent.userId,
      body: interventionBody,
      kind: "coach",
      idempotencyKey: `intervention-sms:${interventionId}`,
      relatedInterventionId: interventionId,
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    })).toMatchObject({ sent: false, reason: "duplicate" });

    now = new Date("2026-08-18T18:05:00Z");
    const progressMessage = await reply("started");
    now = new Date("2026-08-18T18:06:00Z");
    const feedbackMessage = await reply("helpful");

    const [storedTask] = await database.select().from(tasks).where(eq(tasks.id, task.id));
    const [storedIntervention] = await database.select().from(interventions).where(eq(interventions.id, interventionId));
    const [storedOutcome] = await database.select().from(interventionOutcomes).where(eq(interventionOutcomes.interventionId, interventionId));
    const [snapshot] = await database.select().from(contextSnapshots).where(eq(contextSnapshots.id, storedIntervention.contextSnapshotId));
    const progressEvents = await database.select().from(taskEvents).where(and(
      eq(taskEvents.taskId, task.id),
      eq(taskEvents.eventType, "started"),
    ));
    expect(storedTask).toMatchObject({ status: "in_progress", startedAt: expect.any(Date) });
    expect(storedIntervention).toMatchObject({ status: "responded", provider: "test", providerMessageSid: sent.providerMessageSid });
    expect(storedOutcome).toMatchObject({
      sourceMessageId: feedbackMessage.id,
      startedAt: expect.any(Date),
      helpful: true,
    });
    expect(snapshot).toMatchObject({ userId: consent.userId, taskId: task.id, decision: "send" });
    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0].sourceMessageId).toBe(progressMessage.id);
    expect(transport.sent.filter((message) => message.body === interventionBody)).toHaveLength(1);
    expect(parser.parse).not.toHaveBeenCalled();
  });
});


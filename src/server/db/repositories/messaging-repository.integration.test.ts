import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "../../config/env";
import { mutateWorkspace } from "./workspace-repository";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { recordWebConsent } from "../../domain/consent";
import { TempoDatabase } from "../client";
import {
  consentRecords,
  conversations,
  conversationMessages,
  memoryEntries,
  messageRelations,
  pendingDeliveryReceipts,
  reminders,
  providerConversations,
  providerMessageBindings,
  rateLimitBuckets,
  scheduledActions,
  userIdentities,
  users,
} from "../schema";
import * as schema from "../schema";
import { DrizzleMessagingRepository } from "./messaging-repository";
import { DrizzleConsentRepository } from "./consent-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";
import { DrizzleConversationHistoryRepository } from "./conversation-history-repository";
import { OperationalRepository } from "./operational-repository";
import { storeDeliveryReceipt } from "./delivery-receipts";
import { WebSessionService } from "../../security/web-session";

const budgetGuard = vi.hoisted(() => ({ access: vi.fn(), outage: false }));
vi.mock("./ai-budget-repository", () => ({ DrizzleAiBudgetRepository: class {
  constructor() { budgetGuard.access(); if (budgetGuard.outage) throw new Error("Synthetic unavailable accounting database"); }
  async reserve() { return { allowed: false, reason: "budget_exhausted" }; }
} }));

async function migratedTestDatabase() {
  const client = new PGlite();
  const migrationDirectory = resolve(process.cwd(), "drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();

  for (const file of migrationFiles) {
    const migration = (await readFile(resolve(migrationDirectory, file), "utf8")).replaceAll(
      "--> statement-breakpoint",
      "",
    );
    await client.exec(migration);
  }

  return {
    client,
    database: drizzle(client, { schema }) as unknown as TempoDatabase,
  };
}

describe("messaging repositories with migrated PostgreSQL", () => {
  let client: PGlite;
  let database: TempoDatabase;

  beforeEach(async () => {
    ({ client, database } = await migratedTestDatabase());
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it.each(["zero_caps", "accounting_outage"])("keeps STOP, HELP, pause and authenticated cancellation independent of AI %s", async failure => {
    vi.stubEnv("AI_BUDGET_MODE", "enforce");
    vi.stubEnv("AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS", "0");
    vi.stubEnv("AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS", "0");
    vi.stubEnv("AI_BUDGET_GLOBAL_DAILY_CALLS", "0");
    vi.stubEnv("AI_BUDGET_ACCOUNT_DAILY_CALLS", "0");
    resetEnvCacheForTests(); budgetGuard.access.mockClear(); budgetGuard.outage = failure === "accounting_outage";
    const repository = new DrizzleMessagingRepository(database);
    const numbers = ["+12025550701", "+12025550702", "+12025550703", "+12025550704"];
    for (const from of numbers) await repository.ingestInbound({ provider: "sendblue", providerMessageId: `${failure}-start-${from}`, from, to: "+12025550000", body: "START" });
    for (const [index, body] of ["STOP", "HELP", "leave me alone"].entries()) {
      await repository.ingestInbound({ provider: "sendblue", providerMessageId: `${failure}-${index}`, from: numbers[index], to: "+12025550000", body });
    }
    const rows = await database.select().from(users);
    expect(rows.find(row => row.phoneE164 === numbers[0])?.status).toBe("opted_out");
    expect(rows.find(row => row.phoneE164 === numbers[2])?.pausedUntil?.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
    const helpUser = rows.find(row => row.phoneE164 === numbers[1])!;
    expect(await database.select().from(scheduledActions).where(and(eq(scheduledActions.userId, helpUser.id), eq(scheduledActions.kind, "send_compliance")))).toHaveLength(1);
    const owner = rows.find(row => row.phoneE164 === numbers[3])!;
    const sessions = new WebSessionService(database);
    const session = await sessions.create(owner.id, new Date(), true);
    const account = await sessions.findAccount(session.token);
    expect(account?.userId).toBe(owner.id);
    const [reminder] = await database.insert(reminders).values({ userId: owner.id, text: "Stretch", remindAt: new Date(Date.now() + 3600000), timezone: "UTC", idempotencyKey: `${failure}-manual-cancel` }).returning();
    await mutateWorkspace(account!.userId, { action: "remove_reminder", id: reminder.id }, database);
    expect((await database.select().from(reminders).where(eq(reminders.id, reminder.id)))[0].status).toBe("cancelled");
    expect(budgetGuard.access).not.toHaveBeenCalled();
  });

  it("handles returning-account START as sign-in, never as AI input or memory", async () => {
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550165", status: "active", onboardingState: "complete",
      lastInboundAt: new Date(), phoneVerifiedAt: new Date(),
    }).returning();
    const sessions = new WebSessionService(database);
    const session = await sessions.create(user.id);
    const repository = new DrizzleMessagingRepository(database);
    const input = { provider: "sendblue" as const, providerMessageId: "SIGNIN_START",
      from: user.phoneE164, to: "+12025550111", body: "START" };
    await repository.ingestInbound(input);
    expect(await repository.ingestInbound(input)).toEqual({ duplicate: true });
    expect(await sessions.findAccount(session.token)).toMatchObject({ phoneVerified: true });
    const messages = await database.select().from(conversationMessages).where(eq(conversationMessages.userId, user.id));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "compliance", status: "processed" });
    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "send_compliance", payload: { signInConfirmed: true } });
    expect(await database.select().from(memoryEntries).where(eq(memoryEntries.userId, user.id))).toHaveLength(0);
  });

  it("does not let START approve a browser that requested a secure sign-in link", async () => {
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550164", status: "active", onboardingState: "complete",
      lastInboundAt: new Date(), phoneVerifiedAt: new Date(),
    }).returning();
    const sessions = new WebSessionService(database);
    const session = await sessions.createSignInRequest(user.id);
    await new DrizzleMessagingRepository(database).ingestInbound({
      provider: "sendblue", providerMessageId: "SECURE_START", from: user.phoneE164, to: "+12025550111", body: "START",
    });
    expect(await sessions.findAccount(session.token)).toMatchObject({ phoneVerified: false });
    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id));
    expect(actions.map(action => action.kind).sort()).toEqual(["send_compliance", "send_signin"]);
    expect(actions.find(action => action.kind === "send_compliance")?.payload).toMatchObject({ signInLinkRequired: true });
    await new DrizzleMessagingRepository(database).ingestInbound({
      provider: "sendblue", providerMessageId: "SECURE_NORMAL", from: user.phoneE164, to: "+12025550111", body: "Add laundry tomorrow",
    });
    expect(await sessions.findAccount(session.token)).toMatchObject({ phoneVerified: false });
  });

  it("stores one message and one action when Twilio retries an inbound webhook", async () => {
    const repository = new DrizzleMessagingRepository(database);
    const input = {
      provider: "twilio", providerMessageId: "SM_DUPLICATE",
      from: "+12025550198",
      to: "+14155550132",
      body: "Finish the report tomorrow",
    } as const;

    expect(await repository.ingestInbound(input)).toEqual({ duplicate: false });
    expect(await repository.ingestInbound(input)).toEqual({ duplicate: true });

    const [messageCount] = await database.select({ value: count() }).from(conversationMessages);
    const [actionCount] = await database.select({ value: count() }).from(scheduledActions);
    expect(messageCount.value).toBe(1);
    expect(actionCount.value).toBe(1);
  });

  it("keeps one Tempo identity and conversation while provider bindings change", async () => {
    const repository = new DrizzleMessagingRepository(database);
    const shared = {
      from: "+12025550197",
      to: "+14155550132",
      body: "Keep this history with my Tempo account",
    };
    await repository.ingestInbound({
      ...shared,
      provider: "sendblue",
      providerMessageId: "SENDBLUE_SWITCH_1",
      service: "iMessage",
    });
    await repository.ingestInbound({
      ...shared,
      provider: "linq",
      providerMessageId: "LINQ_SWITCH_1",
      providerConversationId: "linq-chat-1",
      service: "iMessage",
    });

    const [user] = await database.select().from(users).where(eq(users.phoneE164, shared.from));
    expect(await database.select().from(userIdentities).where(eq(userIdentities.userId, user.id))).toHaveLength(1);
    const tempoConversations = await database.select().from(conversations).where(eq(conversations.ownerUserId, user.id));
    expect(tempoConversations).toHaveLength(1);
    expect(await database.select().from(conversationMessages).where(eq(conversationMessages.conversationId, tempoConversations[0].id)))
      .toHaveLength(2);
    const providerBindings = await database.select().from(providerConversations)
      .where(eq(providerConversations.conversationId, tempoConversations[0].id));
    expect(providerBindings.map((binding) => binding.provider).sort()).toEqual(["linq", "sendblue"]);
    expect(await database.select().from(providerMessageBindings)).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "sendblue", externalMessageId: "SENDBLUE_SWITCH_1" }),
      expect.objectContaining({ provider: "linq", externalMessageId: "LINQ_SWITCH_1" }),
    ]));
  });

  it("records STOP and cancels pending application work", async () => {
    const repository = new DrizzleMessagingRepository(database);
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_START",
      from: "+12025550198",
      to: "+14155550132",
      body: "START",
      complianceKeyword: "START",
    });
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_TASK",
      from: "+12025550198",
      to: "+14155550132",
      body: "I need to write the report",
    });
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_STOP",
      from: "+12025550198",
      to: "+14155550132",
      body: "STOP",
      complianceKeyword: "STOP",
    });

    const [user] = await database.select().from(users).where(eq(users.phoneE164, "+12025550198"));
    const [latestConsent] = await database
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, user.id))
      .orderBy(desc(consentRecords.createdAt))
      .limit(1);
    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id));
    const [taskMessage] = await database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid, "SM_TASK"));

    expect(user.status).toBe("opted_out");
    expect(user.optedOutAt).toBeInstanceOf(Date);
    expect(latestConsent.status).toBe("revoked");
    expect(actions.every(action => action.status === "cancelled")).toBe(true);
    expect(taskMessage.status).toBe("cancelled");
    expect((await new OperationalRepository(database).messageHealth(new Date(Date.now() + 700_000))).pendingInbound).toBe(0);
  });

  it.each(["STOP", "leave me alone"])("suppresses unclaimed dispatched work and new ordinary texts after %s", async command => {
    const repository = new DrizzleMessagingRepository(database);
    const phone = { provider: "linq" as const, from: "+12025550164", to: "+14155550132" };
    const send = (providerMessageId: string, body: string) => repository.ingestInbound({ ...phone, providerMessageId, body });
    await send("control-start", "START");
    const [owner] = await database.select({ id: users.id }).from(users).where(eq(users.phoneE164, phone.from));
    await send("already-dispatched", "Save this later");
    await database.update(scheduledActions).set({ status: "running" })
      .where(and(eq(scheduledActions.userId, owner.id), eq(scheduledActions.kind, "process_inbound_message")));

    await send("suppression", command);
    expect(await send("suppressed", "Add a task while suppressed")).toEqual({ duplicate: false });
    expect(await send("suppressed", "Add a task while suppressed")).toEqual({ duplicate: true });
    const held = await database.select().from(conversationMessages).where(eq(conversationMessages.userId, owner.id));
    expect(held.find(message => message.providerMessageSid === "already-dispatched")?.status).toBe("cancelled");
    expect(held.find(message => message.providerMessageSid === "suppressed")?.status).toBe("cancelled");
    const [inboundAction] = await database.select().from(scheduledActions)
      .where(and(eq(scheduledActions.userId, owner.id), eq(scheduledActions.kind, "process_inbound_message")));
    expect(inboundAction.status).toBe("cancelled");
    expect((await new OperationalRepository(database).messageHealth(new Date(Date.now() + 700_000))).pendingInbound).toBe(0);

    await send("resume", command === "STOP" ? "START" : "resume");
    await send("after-resume", "Add a new task");
    expect(await send("suppressed", "Add a task while suppressed")).toEqual({ duplicate: true });
    const [afterResume] = await database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid, "after-resume"));
    expect(afterResume.status).toBe("received");
    const inboundActions = await database.select().from(scheduledActions)
      .where(and(eq(scheduledActions.userId, owner.id), eq(scheduledActions.kind, "process_inbound_message")));
    expect(inboundActions.some(action => action.payload.messageId === afterResume.id && action.status === "scheduled")).toBe(true);
    expect(inboundActions.some(action => action.payload.messageId === held.find(message => message.providerMessageSid === "suppressed")?.id)).toBe(false);
  });

  it("links only owner-scoped provider replies and omits legacy foreign reply IDs from history", async () => {
    const repository = new DrizzleMessagingRepository(database);
    const base = { provider: "linq" as const, to: "+14155550132" };
    await repository.ingestInbound({ ...base, from: "+12025550164", providerMessageId: "owner-parent", body: "Owned target" });
    await repository.ingestInbound({ ...base, from: "+12025550163", providerMessageId: "foreign-parent", body: "Foreign target" });
    await repository.ingestInbound({ ...base, from: "+12025550164", providerMessageId: "foreign-reply", body: "Unlinked reply", replyToProviderMessageId: "foreign-parent" });
    await repository.ingestInbound({ ...base, from: "+12025550164", providerMessageId: "owner-reply", body: "Owned reply", replyToProviderMessageId: "owner-parent" });
    await repository.ingestInbound({ ...base, from: "+12025550164", providerMessageId: "self-reply", body: "Self reply", replyToProviderMessageId: "self-reply" });
    const all = await database.select().from(conversationMessages);
    const message = (sid: string) => all.find(row => row.providerMessageSid === sid)!;
    expect(await database.select().from(messageRelations)).toEqual([expect.objectContaining({
      sourceMessageId: message("owner-reply").id, targetMessageId: message("owner-parent").id,
    })]);

    const foreignReply = message("foreign-reply");
    await database.insert(messageRelations).values({
      conversationId: foreignReply.conversationId, sourceMessageId: foreignReply.id,
      targetMessageId: message("foreign-parent").id, type: "reply",
    });
    await database.update(conversationMessages).set({ status: "processed", createdAt: new Date(Date.now() - 60_000) })
      .where(inArray(conversationMessages.id, [foreignReply.id, message("owner-reply").id, message("owner-parent").id]));
    const history = await new DrizzleConversationHistoryRepository(database).getRecent({
      conversationId: foreignReply.conversationId, beforeMessageId: message("self-reply").id, limit: 12,
    });
    expect(history.find(row => row.id === foreignReply.id)).toMatchObject({ content: "Unlinked reply", replyToMessageId: undefined });
    expect(history.find(row => row.id === message("owner-reply").id)?.replyToMessageId).toBe(message("owner-parent").id);
    expect(history.some(row => row.id === message("foreign-parent").id || row.content === "Foreign target")).toBe(false);
  });

  it.each(["STOP", "leave me alone"])("blocks a reserved send when %s commits before submission", async command => {
    const repository = new DrizzleMessagingRepository(database);
    const phone = { provider: "linq" as const, from: "+12025550164", to: "+14155550132" };
    await repository.ingestInbound({ ...phone, providerMessageId: "control-start", body: "START" });
    const [owner] = await database.select({ id: users.id }).from(users).where(eq(users.phoneE164, phone.from));
    const transport = new TestSmsTransport();
    const result = await new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport).send({
      userId: owner.id, body: "Never sent", kind: "coach", idempotencyKey: "racing-submission",
      assertOwnership: async () => { await repository.ingestInbound({ ...phone, providerMessageId: "suppression", body: command }); },
    });
    expect(result).toMatchObject({ sent: false, reason: command === "STOP" ? "missing_consent" : "paused" });
    expect(transport.sent).toHaveLength(0);
    const [outbound] = await database.select().from(conversationMessages).where(eq(conversationMessages.idempotencyKey, "racing-submission"));
    expect(outbound).toMatchObject({ status: "cancelled", outboundState: "suppressed", submissionStartedAt: null, providerMessageSid: null });
  });

  it("enforces compliance keywords even without Twilio opt-out metadata", async () => {
    const repository = new DrizzleMessagingRepository(database);
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_RAW_START",
      from: "+12025550192",
      to: "+14155550132",
      body: "UNSTOP",
    });
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_RAW_PROGRESS_START",
      from: "+12025550192",
      to: "+14155550132",
      body: "START",
    });
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_RAW_STOP",
      from: "+12025550192",
      to: "+14155550132",
      body: "unsubscribe",
    });
    const [user] = await database.select().from(users).where(eq(users.phoneE164, "+12025550192"));
    expect(user.status).toBe("opted_out");
    const consents = await database.select().from(consentRecords).where(eq(consentRecords.userId, user.id));
    expect(consents.map((record) => record.status)).toEqual(["granted", "revoked"]);
    const messages = await database.select().from(conversationMessages).where(eq(conversationMessages.userId, user.id));
    expect(messages.map((message) => message.kind)).toEqual(["compliance", "user", "compliance"]);
    expect(await database.select().from(scheduledActions).where(and(
      eq(scheduledActions.userId, user.id),
      eq(scheduledActions.status, "scheduled"),
    ))).toHaveLength(0);
  });

  it("turns a text-first START opt-in into the same durable onboarding path", async () => {
    const repository = new DrizzleMessagingRepository(database);
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_TEXT_FIRST_START",
      from: "+12025550196",
      to: "+14155550132",
      body: "START",
      complianceKeyword: "START",
    });
    const [user] = await database.select().from(users).where(eq(users.phoneE164, "+12025550196"));
    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id));
    expect(user).toMatchObject({ status: "active", onboardingState: "introduction" });
    expect(actions.map((action) => action.kind).sort()).toEqual(["evaluate_context", "send_welcome"]);
  });

  it("queues one asynchronous compliance reply for HELP", async () => {
    const repository = new DrizzleMessagingRepository(database);
    await repository.ingestInbound({
      provider: "sendblue", providerMessageId: "SENDBLUE_HELP_START",
      from: "+12025550197", to: "+12025550111", body: "START", service: "iMessage",
    });
    expect(await repository.ingestInbound({
      provider: "sendblue", providerMessageId: "SENDBLUE_HELP",
      from: "+12025550197", to: "+12025550111", body: "HELP", service: "iMessage",
    })).toEqual({ duplicate: false });
    expect(await repository.ingestInbound({
      provider: "sendblue", providerMessageId: "SENDBLUE_HELP",
      from: "+12025550197", to: "+12025550111", body: "HELP", service: "iMessage",
    })).toEqual({ duplicate: true });

    const [user] = await database.select().from(users).where(eq(users.phoneE164, "+12025550197"));
    const helpActions = await database.select().from(scheduledActions).where(and(
      eq(scheduledActions.userId, user.id),
      eq(scheduledActions.kind, "send_compliance"),
    ));
    const [handledHelp] = await database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid,"SENDBLUE_HELP"));
    expect(handledHelp.status).toBe("processed");
    expect(helpActions).toHaveLength(1);
    expect(helpActions[0].idempotencyKey).toBe("help:sendblue:SENDBLUE_HELP");
  });

  it("waits for a Sendblue web signup to text START before scheduling the welcome", async () => {
    const consent = await recordWebConsent(
      new DrizzleConsentRepository(database),
      {
        countryCode: "US", callingCode: "+1", areaCode: "646",
        subscriberNumber: "5550198", consent: true,
      },
      { auditKey: "audit-secret", onboardingFlow: "user_first" },
    );
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.userId, consent.userId)))
      .toHaveLength(0);

    await new DrizzleMessagingRepository(database).ingestInbound({
      provider: "sendblue", providerMessageId: "SENDBLUE_WEB_START",
      from: "+16465550198", to: "+12025550111", body: "START", service: "iMessage",
    });

    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, consent.userId));
    const [user] = await database.select().from(users).where(eq(users.id, consent.userId));
    const [message] = await database.select().from(conversationMessages)
      .where(eq(conversationMessages.providerMessageSid, "SENDBLUE_WEB_START"));
    expect(message).toMatchObject({ provider: "sendblue", providerService: "iMessage", kind: "compliance" });
    const [handled] = await database.select().from(conversationMessages).where(eq(conversationMessages.userId,user.id));
    expect(handled.status).toBe("processed");
    expect(user.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(actions.map((action) => action.kind).sort()).toEqual(["evaluate_context", "send_welcome"]);
  });

  it("activates a web signup from its first verified non-keyword reply without treating it as a task", async () => {
    const consent = await recordWebConsent(
      new DrizzleConsentRepository(database),
      {
        countryCode: "US", callingCode: "+1", areaCode: "917",
        subscriberNumber: "5550198", consent: true,
      },
      { auditKey: "audit-secret", onboardingFlow: "user_first" },
    );

    await new DrizzleMessagingRepository(database).ingestInbound({
      provider: "sendblue", providerMessageId: "SENDBLUE_VERIFIED_REPLY",
      from: "+19175550198", to: "+12025550111", body: "Verified", service: "iMessage",
    });

    const [user] = await database.select().from(users).where(eq(users.id, consent.userId));
    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, consent.userId));
    expect(user.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(actions.map((action) => action.kind).sort()).toEqual(["evaluate_context", "send_welcome"]);
  });

  it("never dispatches to a paused user and sends an allowed idempotency key once", async () => {
    const inbound = new DrizzleMessagingRepository(database);
    await inbound.ingestInbound({
      provider: "twilio", providerMessageId: "SM_START",
      from: "+12025550198",
      to: "+14155550132",
      body: "START",
      complianceKeyword: "START",
    });
    const [user] = await database.select().from(users).where(eq(users.phoneE164, "+12025550198"));
    const transport = new TestSmsTransport();
    const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport);
    const sendInput = {
      userId: user.id,
      body: "Welcome to Tempo",
      kind: "system" as const,
      idempotencyKey: "welcome:user-1:v1",
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    };

    expect((await sender.send(sendInput)).sent).toBe(true);
    expect(await sender.send(sendInput)).toMatchObject({ sent: false, reason: "duplicate" });
    expect(transport.sent).toHaveLength(1);

    await database.update(users).set({ status: "paused" }).where(eq(users.id, user.id));
    expect(
      await sender.send({ ...sendInput, idempotencyKey: "welcome:user-1:v2" }),
    ).toEqual({ sent: false, reason: "paused" });
    expect(transport.sent).toHaveLength(1);

    const [outboundCount] = await database
      .select({ value: count() })
      .from(conversationMessages)
      .where(and(eq(conversationMessages.userId, user.id), eq(conversationMessages.direction, "outbound")));
    expect(outboundCount.value).toBe(1);
  });

  it("keeps message and binding delivery states monotonic across stale callbacks and acceptance replay", async () => {
    const inbound = new DrizzleMessagingRepository(database);
    await inbound.ingestInbound({
      provider: "twilio", providerMessageId: "SM_DELIVERY_START",
      from: "+12025550195",
      to: "+14155550132",
      body: "START",
      complianceKeyword: "START",
    });
    const [user] = await database.select().from(users).where(eq(users.phoneE164, "+12025550195"));
    const transport = new TestSmsTransport("LIFECYCLE");
    const outbound = new DrizzleOutboundMessageRepository(database);
    const sent = await new SafeSmsSender(outbound, transport).send({
      userId: user.id,
      body: "A lifecycle test",
      kind: "system",
      idempotencyKey: "lifecycle:test",
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });
    expect(sent.sent).toBe(true);
    if (!sent.sent) throw new Error("Expected simulated delivery");

    await inbound.updateDelivery({ provider: sent.provider, providerMessageId: sent.providerMessageSid, status: "delivered", rawMetadata: { receipt: "delivered" } });
    await inbound.updateDelivery({ provider: sent.provider, providerMessageId: sent.providerMessageSid, status: "sent" });
    await inbound.updateDelivery({ provider: sent.provider, providerMessageId: sent.providerMessageSid, status: "failed", errorCode: "stale", rawMetadata: { receipt: "stale" } });
    await outbound.markSubmitted(sent.messageId, sent.provider, sent.providerMessageSid);

    const [message] = await database.select().from(conversationMessages)
      .where(eq(conversationMessages.providerMessageSid, sent.providerMessageSid));
    expect(message).toMatchObject({ status: "delivered", outboundState: "accepted", providerErrorCode: null });
    expect(message.deliveredAt).toBeInstanceOf(Date);
    const [binding] = await database.select().from(providerMessageBindings).where(eq(providerMessageBindings.messageId, message.id));
    expect(binding).toMatchObject({ deliveryStatus: "delivered", rawMetadata: { receipt: "delivered" } });
  });

  it("ignores a delivery callback whose provider ID belongs to an inbound message", async () => {
    const repository = new DrizzleMessagingRepository(database);
    await repository.ingestInbound({
      provider: "linq", providerMessageId: "inbound-provider-id",
      from: "+12025550164", to: "+14155550132", body: "A real inbound",
      rawMetadata: { source: "inbound" },
    });
    await repository.updateDelivery({
      provider: "linq", providerMessageId: "inbound-provider-id", status: "delivered", rawMetadata: { source: "delivery" },
    });
    const [message] = await database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid, "inbound-provider-id"));
    const [binding] = await database.select().from(providerMessageBindings).where(eq(providerMessageBindings.messageId, message.id));
    expect(message).toMatchObject({ direction: "inbound", status: "received", deliveredAt: null });
    expect(binding).toMatchObject({ deliveryStatus: "received", rawMetadata: { source: "inbound" } });
    expect(await database.select().from(pendingDeliveryReceipts)).toHaveLength(0);
  });

  it("allows a verified Linq delivery after a failure and clears the old failure details", async () => {
    const inbound = new DrizzleMessagingRepository(database);
    await inbound.ingestInbound({
      provider: "linq", providerMessageId: "linq-start",
      from: "+12025550164", to: "+14155550132", body: "START",
    });
    const [user] = await database.select({ id: users.id }).from(users).where(eq(users.phoneE164, "+12025550164"));
    const outbound = new DrizzleOutboundMessageRepository(database);
    const { messageId } = await outbound.reserve({ userId: user.id, body: "Synthetic outbound", kind: "coach", idempotencyKey: "linq-delivery-recovery" });
    expect(await outbound.beginSubmission(messageId, new Date())).toMatchObject({ status: "started" });
    await outbound.markSubmitted(messageId, "linq", "linq-outbound");
    const receipt = { provider: "linq" as const, providerMessageId: "linq-outbound" };
    await inbound.updateDelivery({ ...receipt, status: "failed", errorCode: "3007", errorMessage: "Synthetic earlier failure" });
    await inbound.updateDelivery({ ...receipt, status: "delivered" });
    await inbound.updateDelivery({ ...receipt, status: "failed", errorCode: "3007" });
    const [message] = await database.select().from(conversationMessages).where(eq(conversationMessages.id, messageId));
    const [binding] = await database.select().from(providerMessageBindings).where(eq(providerMessageBindings.messageId, messageId));
    expect(message).toMatchObject({ status: "delivered", providerErrorCode: null, providerErrorMessage: null, deliveredAt: expect.any(Date) });
    expect(binding.deliveryStatus).toBe("delivered");
  });

  it("stages only minimal early evidence, consumes the exact ID on acceptance, and leaves ambiguity held", async () => {
    const inbound = new DrizzleMessagingRepository(database);
    await inbound.ingestInbound({
      provider: "linq", providerMessageId: "early-start", from: "+12025550164", to: "+14155550132", body: "START",
    });
    const [user] = await database.select({ id: users.id }).from(users).where(eq(users.phoneE164, "+12025550164"));
    const outbound = new DrizzleOutboundMessageRepository(database);
    const reserve = async (idempotencyKey: string) => {
      const { messageId } = await outbound.reserve({ userId: user.id, body: "Synthetic outbound", kind: "coach", idempotencyKey });
      expect(await outbound.beginSubmission(messageId, new Date())).toMatchObject({ status: "started" });
      return messageId;
    };
    const messageId = await reserve("early-receipt-1");
    const ambiguousId = await reserve("early-receipt-2");
    await outbound.markFailed(ambiguousId, new Error("Synthetic unknown send"));

    const provider = "linq" as const;
    const receipt = { provider, providerMessageId: "early-outbound" };
    await inbound.updateDelivery({ ...receipt, status: "failed", errorCode: "3007", errorMessage: "Discard this free text", rawMetadata: { discard: "private" } });
    const [first] = await database.select().from(pendingDeliveryReceipts).where(eq(pendingDeliveryReceipts.externalMessageId, receipt.providerMessageId));
    expect(first).toEqual({
      provider, externalMessageId: receipt.providerMessageId, status: "failed", errorCode: "3007",
      firstSeenAt: expect.any(Date), statusObservedAt: expect.any(Date), expiresAt: expect.any(Date),
    });
    expect(first.expiresAt.getTime() - first.firstSeenAt.getTime()).toBe(24 * 60 * 60_000);
    await inbound.updateDelivery({ ...receipt, status: "delivered" });
    await inbound.updateDelivery({ ...receipt, status: "sent" });
    await inbound.updateDelivery({ provider, providerMessageId: "other-provider-id", status: "failed", errorCode: "not a valid code" });
    const staged = await database.select().from(pendingDeliveryReceipts);
    expect(staged).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalMessageId: receipt.providerMessageId, status: "delivered", errorCode: null, expiresAt: first.expiresAt }),
      expect.objectContaining({ externalMessageId: "other-provider-id", status: "failed", errorCode: null }),
    ]));

    await outbound.markSubmitted(messageId, provider, receipt.providerMessageId);
    const [message] = await database.select().from(conversationMessages).where(eq(conversationMessages.id, messageId));
    const [binding] = await database.select().from(providerMessageBindings).where(eq(providerMessageBindings.messageId, messageId));
    const [ambiguous] = await database.select().from(conversationMessages).where(eq(conversationMessages.id, ambiguousId));
    expect(message).toMatchObject({ status: "delivered", outboundState: "accepted", deliveredAt: expect.any(Date) });
    expect(binding).toMatchObject({ deliveryStatus: "delivered", rawMetadata: {} });
    expect(ambiguous).toMatchObject({ outboundState: "ambiguous", providerMessageSid: null,
      providerErrorMessage: "Provider acceptance could not be verified." });
    expect(await database.select().from(pendingDeliveryReceipts)).toEqual([expect.objectContaining({ externalMessageId: "other-provider-id" })]);

    await database.update(pendingDeliveryReceipts).set({ expiresAt: new Date(0) })
      .where(eq(pendingDeliveryReceipts.externalMessageId, "other-provider-id"));
    const later = await reserve("early-receipt-expired");
    await outbound.markSubmitted(later, provider, "other-provider-id");
    const [afterExpiry] = await database.select().from(conversationMessages).where(eq(conversationMessages.id, later));
    expect(afterExpiry).toMatchObject({ status: "queued", outboundState: "accepted", providerErrorCode: null });
    expect(await database.select().from(pendingDeliveryReceipts)).toHaveLength(0);
  });

  it("bounds new unknown IDs by count and rate while accepting a known delivery", async () => {
    const now = new Date("2026-11-10T15:00:00Z");
    const provider = "linq" as const;
    const receive = (providerMessageId: string) =>
      storeDeliveryReceipt(database, { provider, providerMessageId, status: "delivered" }, now);
    await database.insert(rateLimitBuckets).values({ key: "pending-delivery:linq", windowStart: now, count: 120, updatedAt: now });
    await receive("blocked-by-rate");
    expect(await database.select().from(pendingDeliveryReceipts)).toHaveLength(0);
    await database.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, "pending-delivery:linq"));
    await database.execute(sql`
      insert into pending_delivery_receipts(provider, external_message_id, status, first_seen_at, status_observed_at, expires_at)
      select 'linq', 'fixture-' || counter, 'sent', ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz + interval '1 day'
      from generate_series(1, 2000) counter
    `);
    await receive("blocked-by-count");
    expect(await database.select({ count: count() }).from(pendingDeliveryReceipts)).toEqual([{ count: 2000 }]);
    const [drops] = await database.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, "pending-delivery-drop:linq"));
    expect(drops.count).toBe(2);

    const inbound = new DrizzleMessagingRepository(database);
    await inbound.ingestInbound({
      provider, providerMessageId: "quota-start", from: "+12025550164", to: "+14155550132", body: "START",
    });
    const [user] = await database.select({ id: users.id }).from(users).where(eq(users.phoneE164, "+12025550164"));
    const outbound = new DrizzleOutboundMessageRepository(database);
    const { messageId } = await outbound.reserve({ userId: user.id, body: "Synthetic outbound", kind: "coach", idempotencyKey: "quota-known" });
    expect(await outbound.beginSubmission(messageId, now)).toMatchObject({ status: "started" });
    await outbound.markSubmitted(messageId, provider, "known-while-full");
    await receive("known-while-full");
    const [message] = await database.select().from(conversationMessages).where(eq(conversationMessages.id, messageId));
    expect(message.status).toBe("delivered");
  });

  it("treats an explicit back-off request as a strong negative signal", async () => {
    const repository = new DrizzleMessagingRepository(database);
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_BACK_OFF",
      from: "+12025550197",
      to: "+14155550132",
      body: "Leave me alone",
    });
    const [user] = await database.select().from(users).where(eq(users.phoneE164, "+12025550197"));
    const [memory] = await database.select().from(memoryEntries).where(eq(memoryEntries.userId, user.id));
    expect(user.status).toBe("active");
    expect(user.pausedUntil!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(memory.content).toContain("asked Tempo to back off");
    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "evaluate_context", status: "scheduled", runAt: user.pausedUntil });
  });

  it("lets a temporarily paused user resume early without overriding a carrier opt-out", async () => {
    const repository = new DrizzleMessagingRepository(database);
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_PAUSE_FIRST",
      from: "+12025550194",
      to: "+14155550132",
      body: "Leave me alone",
    });
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_RESUME_EARLY",
      from: "+12025550194",
      to: "+14155550132",
      body: "resume",
    });
    const [resumed] = await database.select().from(users).where(eq(users.phoneE164, "+12025550194"));
    expect(resumed).toMatchObject({ status: "active", pausedUntil: null });
    const resumeActions = await database.select().from(scheduledActions).where(and(
      eq(scheduledActions.userId, resumed.id),
      eq(scheduledActions.status, "scheduled"),
    ));
    expect(resumeActions.map((action) => action.kind).sort()).toEqual(["evaluate_context", "process_inbound_message"]);

    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_RESUME_STOP",
      from: "+12025550194",
      to: "+14155550132",
      body: "STOP",
      complianceKeyword: "STOP",
    });
    await repository.ingestInbound({
      provider: "twilio", providerMessageId: "SM_RESUME_WHILE_OPTED_OUT",
      from: "+12025550194",
      to: "+14155550132",
      body: "resume",
    });
    const [stillOptedOut] = await database.select().from(users).where(eq(users.id, resumed.id));
    expect(stillOptedOut.status).toBe("opted_out");
  });
});

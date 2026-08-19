import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, count, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { recordWebConsent } from "../../domain/consent";
import { TempoDatabase } from "../client";
import {
  consentRecords,
  conversationMessages,
  memoryEntries,
  scheduledActions,
  users,
} from "../schema";
import * as schema from "../schema";
import { DrizzleMessagingRepository } from "./messaging-repository";
import { DrizzleConsentRepository } from "./consent-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";

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
    const [action] = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id));

    expect(user.status).toBe("opted_out");
    expect(user.optedOutAt).toBeInstanceOf(Date);
    expect(latestConsent.status).toBe("revoked");
    expect(action.status).toBe("cancelled");
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

  it("waits for a Linq web signup to text START before scheduling the welcome", async () => {
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
      provider: "linq", providerMessageId: "LINQ_WEB_START",
      from: "+16465550198", to: "+12025550111", body: "START", service: "iMessage",
    });

    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, consent.userId));
    const [message] = await database.select().from(conversationMessages)
      .where(eq(conversationMessages.providerMessageSid, "LINQ_WEB_START"));
    expect(message).toMatchObject({ provider: "linq", providerService: "iMessage", kind: "compliance" });
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

  it("keeps delivery callbacks monotonic when Twilio retries them out of order", async () => {
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
    const sent = await new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport).send({
      userId: user.id,
      body: "A lifecycle test",
      kind: "system",
      idempotencyKey: "lifecycle:test",
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });
    expect(sent.sent).toBe(true);
    if (!sent.sent) throw new Error("Expected simulated delivery");

    await inbound.updateDelivery({ provider: sent.provider, providerMessageId: sent.providerMessageSid, status: "delivered" });
    await inbound.updateDelivery({ provider: sent.provider, providerMessageId: sent.providerMessageSid, status: "sent" });
    await inbound.updateDelivery({ provider: sent.provider, providerMessageId: sent.providerMessageSid, status: "failed" });

    const [message] = await database.select().from(conversationMessages)
      .where(eq(conversationMessages.providerMessageSid, sent.providerMessageSid));
    expect(message.status).toBe("delivered");
    expect(message.deliveredAt).toBeInstanceOf(Date);
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

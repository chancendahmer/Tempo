import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { users, consentRecords, conversationMessages, conversations, scheduledActions, userIdentities } from "../schema";
import { DrizzleMessagingRepository } from "./messaging-repository";
import { PilotAdmissionRepository } from "./pilot-admission-repository";
import { WebSessionService } from "../../security/web-session";
import type { PilotAdmissionPolicy } from "../../domain/pilot-admission";
import { DrizzleConsentRepository } from "./consent-repository";
import { recordWebConsent } from "../../domain/consent";

const closed: PilotAdmissionPolicy = { PILOT_ADMISSION_MODE: "invite_only", PILOT_INVITED_PHONES: [] };
const malformed: PilotAdmissionPolicy = { PILOT_ADMISSION_MODE: null, PILOT_INVITED_PHONES: null };
const inbound = (phone: string, id: string, body = "START") => ({ provider: "sendblue" as const, providerMessageId: id, from: phone, to: "+12025550111", body });

describe("pilot admission before inbound account and job creation", () => {
  let client: PGlite;
  let database: TempoDatabase;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
  });
  afterAll(async () => client.close());

  it("ACKs repeated rejected senders without creating users, messages, conversations, identities or jobs", async () => {
    const repository = new DrizzleMessagingRepository(database, closed);
    for (const body of ["START", "HELP", "Add a task tomorrow"]) {
      const input = inbound("+12025550180", `DENIED_${body}`, body);
      expect(await repository.ingestInbound(input)).toEqual({ duplicate: true });
      expect(await repository.ingestInbound(input)).toEqual({ duplicate: true });
    }
    for (const table of [users, conversationMessages, conversations, userIdentities, scheduledActions]) {
      expect(await database.select().from(table)).toHaveLength(0);
    }
  });

  it("durably suppresses unknown STOP before admission and requires explicit START after a later invitation", async () => {
    const phone = "+12025550188";
    const repository = new DrizzleMessagingRepository(database, malformed);
    const stop = inbound(phone, "UNKNOWN_STOP", "STOP");
    expect(await repository.ingestInbound(stop)).toEqual({ duplicate: false });
    expect(await repository.ingestInbound(stop)).toEqual({ duplicate: true });
    const [user] = await database.select().from(users).where(eq(users.phoneE164, phone));
    expect(user).toMatchObject({ status: "opted_out", onboardingState: "awaiting_consent", phoneVerifiedAt: null, lastInboundAt: null });
    expect(await new PilotAdmissionRepository(database).isOptedOut(phone)).toBe(true);
    expect(await new PilotAdmissionRepository(database).isVerifiedExisting(phone)).toBe(false);
    expect(await database.select().from(consentRecords).where(eq(consentRecords.userId, user.id))).toHaveLength(1);
    for (const table of [conversationMessages, scheduledActions, userIdentities]) {
      expect(await database.select().from(table).where(eq(table.userId, user.id))).toHaveLength(0);
    }
    expect(await database.select().from(conversations).where(eq(conversations.ownerUserId, user.id))).toHaveLength(0);
    await recordWebConsent(new DrizzleConsentRepository(database), {
      countryCode: "US", callingCode: "+1", areaCode: "202", subscriberNumber: "5550188", consent: true,
    }, { auditKey: "local-test-key" });
    expect((await database.select().from(users).where(eq(users.id, user.id)))[0]).toMatchObject({ status: "opted_out", phoneVerifiedAt: null });
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).toHaveLength(0);
    const invited = new DrizzleMessagingRepository(database, { ...closed, PILOT_INVITED_PHONES: [phone] });
    // Invitation alone changes no suppression. Only the person's explicit START
    // takes the ordinary consent-grant path and queues their welcome.
    expect(await new PilotAdmissionRepository(database).isOptedOut(phone)).toBe(true);
    expect(await invited.ingestInbound(inbound(phone, "INVITED_EXPLICIT_START"))).toEqual({ duplicate: false });
    expect((await database.select().from(users).where(eq(users.id, user.id)))[0]).toMatchObject({ status: "active", onboardingState: "introduction", optedOutAt: null });
    expect(await new PilotAdmissionRepository(database).isVerifiedExisting(phone)).toBe(true);
    expect((await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).map(action => action.kind).sort()).toEqual(["evaluate_context", "send_welcome"]);
    expect(await invited.ingestInbound(stop)).toEqual({ duplicate: true });
    expect((await database.select().from(users).where(eq(users.id, user.id)))[0].status).toBe("active");
  });

  it("does not let an unverified web-signup record bypass admission or activate its browser", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550181", onboardingState: "introduction" }).returning();
    const sessions = new WebSessionService(database);
    const session = await sessions.create(user.id);
    const repository = new DrizzleMessagingRepository(database, closed);
    expect(await new PilotAdmissionRepository(database).isVerifiedExisting(user.phoneE164)).toBe(false);
    expect(await repository.ingestInbound(inbound(user.phoneE164, "UNVERIFIED_START"))).toEqual({ duplicate: true });
    expect(await sessions.findAccount(session.token)).toMatchObject({ phoneVerified: false });
    expect(await database.select().from(conversationMessages).where(eq(conversationMessages.userId, user.id))).toHaveLength(0);
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).toHaveLength(0);
  });

  it("preserves HELP and STOP for existing unverified accounts even with malformed policy, without admission escalation", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550182", onboardingState: "introduction" }).returning();
    const sessions = new WebSessionService(database);
    const session = await sessions.create(user.id);
    const repository = new DrizzleMessagingRepository(database, malformed);
    const help = inbound(user.phoneE164, "UNVERIFIED_HELP", "HELP");
    expect(await repository.ingestInbound(help)).toEqual({ duplicate: false });
    expect(await repository.ingestInbound(help)).toEqual({ duplicate: true });
    expect(await sessions.findAccount(session.token)).toMatchObject({ phoneVerified: false });
    expect(await new PilotAdmissionRepository(database).isVerifiedExisting(user.phoneE164)).toBe(false);
    expect((await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).map(action => action.kind)).toEqual(["send_compliance"]);
    const stop = inbound(user.phoneE164, "UNVERIFIED_STOP", "STOP");
    expect(await repository.ingestInbound(stop)).toEqual({ duplicate: false });
    expect(await repository.ingestInbound(stop)).toEqual({ duplicate: true });
    expect((await database.select().from(users).where(eq(users.id, user.id)))[0]).toMatchObject({ status: "opted_out", phoneVerifiedAt: null });
    expect(await repository.ingestInbound(inbound(user.phoneE164, "AFTER_HELP_START"))).toEqual({ duplicate: true });
    expect((await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).every(action => action.status === "cancelled")).toBe(true);
  });

  it("preserves natural-language opt-out for existing unverified accounts without scheduling resumption", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550183", onboardingState: "introduction" }).returning();
    await new DrizzleMessagingRepository(database, closed).ingestInbound(inbound(user.phoneE164, "PAUSE_DENIED", "leave me alone"));
    expect((await database.select().from(users).where(eq(users.id, user.id)))[0].pausedUntil).toBeInstanceOf(Date);
    expect(await new PilotAdmissionRepository(database).isVerifiedExisting(user.phoneE164)).toBe(false);
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).toHaveLength(0);
  });

  it("can verify a previously unadmitted HELP sender after a genuine invitation", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550189", onboardingState: "introduction" }).returning();
    const sessions = new WebSessionService(database);
    const session = await sessions.create(user.id);
    await new DrizzleMessagingRepository(database, closed).ingestInbound(inbound(user.phoneE164, "BEFORE_INVITE_HELP", "HELP"));
    expect(await sessions.findAccount(session.token)).toMatchObject({ phoneVerified: false });
    await new DrizzleMessagingRepository(database, { ...closed, PILOT_INVITED_PHONES: [user.phoneE164] })
      .ingestInbound(inbound(user.phoneE164, "AFTER_INVITE_START"));
    expect(await sessions.findAccount(session.token)).toMatchObject({ phoneVerified: true });
    const actions = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id));
    expect(actions.map(action => action.kind).sort()).toEqual(["evaluate_context", "send_compliance", "send_welcome"]);
  });

  it.each([
    { verified: false, mode: "invite_only" as const, phone: "+12025550190" },
    { verified: true, mode: "invite_only" as const, phone: "+12025550191" },
    { verified: false, mode: "open" as const, phone: "+12025550192" },
    { verified: true, mode: "open" as const, phone: "+12025550193" },
  ])("never lets pause or later website consent reverse STOP ($mode, verified existing: $verified)", async ({ verified, mode, phone }) => {
    if (verified) await database.insert(users).values({
      phoneE164: phone, onboardingState: "complete", phoneVerifiedAt: new Date(), lastInboundAt: new Date(),
    });
    const policy: PilotAdmissionPolicy = { ...closed, PILOT_ADMISSION_MODE: mode };
    await new DrizzleMessagingRepository(database, policy).ingestInbound(inbound(phone, `PAUSE_CHAIN_STOP_${phone}`, "STOP"));
    const [user] = await database.select().from(users).where(eq(users.phoneE164, phone));
    await new DrizzleMessagingRepository(database, policy).ingestInbound(inbound(phone, `PAUSE_CHAIN_PAUSE_${phone}`, "leave me alone"));
    expect((await database.select().from(users).where(eq(users.id, user.id)))[0]).toMatchObject({ status: "opted_out", optedOutAt: expect.any(Date), pausedUntil: expect.any(Date) });
    const invited = new DrizzleMessagingRepository(database, { ...closed, PILOT_INVITED_PHONES: [phone] });
    await invited.ingestInbound(inbound(phone, `PAUSE_CHAIN_INVITED_PAUSE_${phone}`, "back off"));
    await recordWebConsent(new DrizzleConsentRepository(database), {
      countryCode: "US", callingCode: "+1", areaCode: "202", subscriberNumber: phone.slice(-7), consent: true,
    }, { auditKey: "local-test-key" });
    expect(await new PilotAdmissionRepository(database).isOptedOut(phone)).toBe(true);
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).toHaveLength(0);
    await invited.ingestInbound(inbound(phone, `PAUSE_CHAIN_EXPLICIT_START_${phone}`));
    expect(await new PilotAdmissionRepository(database).isOptedOut(phone)).toBe(false);
    expect((await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).map(action => action.kind).sort()).toEqual(["evaluate_context", "send_welcome"]);
  });

  it("admits invited senders with normal deduplication and onboarding jobs", async () => {
    const phone = "+12025550184";
    const repository = new DrizzleMessagingRepository(database, { ...closed, PILOT_INVITED_PHONES: [phone] });
    const input = inbound("+1 (202) 555-0184", "INVITED_START");
    expect(await repository.ingestInbound(input)).toEqual({ duplicate: false });
    expect(await repository.ingestInbound(input)).toEqual({ duplicate: true });
    const [user] = await database.select().from(users).where(eq(users.phoneE164, phone));
    expect(user.phoneVerifiedAt).toBeInstanceOf(Date);
    expect((await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).map(action => action.kind).sort()).toEqual(["evaluate_context", "send_welcome"]);
    expect(await new PilotAdmissionRepository(database).isVerifiedExisting(phone)).toBe(true);
  });

  it("grandfathers verified existing accounts but not merely complete unverified or unconsented accounts", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550185", onboardingState: "complete", phoneVerifiedAt: new Date(), lastInboundAt: new Date() }).returning();
    const repository = new DrizzleMessagingRepository(database, malformed);
    expect(await repository.ingestInbound(inbound(user.phoneE164, "EXISTING_TASK", "Add laundry tomorrow"))).toEqual({ duplicate: false });
    expect((await database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).map(action => action.kind)).toEqual(["process_inbound_message"]);
    for (const [phone, onboardingState, phoneVerifiedAt] of [
      ["+12025550186", "complete", null], ["+12025550187", "awaiting_consent", new Date()],
    ] as const) {
      await database.insert(users).values({ phoneE164: phone, onboardingState, phoneVerifiedAt });
      expect(await new PilotAdmissionRepository(database).isVerifiedExisting(phone)).toBe(false);
      expect(await repository.ingestInbound(inbound(phone, `NOT_ESTABLISHED_${phone}`))).toEqual({ duplicate: true });
    }
  });
});

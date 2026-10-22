import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { TempoDatabase } from "../../src/server/db/client";
import * as schema from "../../src/server/db/schema";
import { DrizzleMessagingRepository } from "../../src/server/db/repositories/messaging-repository";
import { PilotAdmissionRepository } from "../../src/server/db/repositories/pilot-admission-repository";
import { DrizzleConsentRepository } from "../../src/server/db/repositories/consent-repository";
import { recordWebConsent } from "../../src/server/domain/consent";

// Independent regression of the reviewer's original STOP/pause reproduction.
it("retains STOP suppression through natural-language pause and website consent", async () => {
  const client = new PGlite();
  try {
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    const db = drizzle(client, { schema }) as unknown as TempoDatabase;
    const phone = "+12025550718", policy = { PILOT_ADMISSION_MODE: "invite_only" as const, PILOT_INVITED_PHONES: [] };
    const repository = new DrizzleMessagingRepository(db, policy);
    const input = { provider: "sendblue" as const, from: phone, to: "+12025550111" };
    await repository.ingestInbound({ ...input, providerMessageId: "review-stop", body: "STOP" });
    expect(await new PilotAdmissionRepository(db).isOptedOut(phone)).toBe(true);
    const [stopped] = await db.select().from(schema.users).where(eq(schema.users.phoneE164, phone));
    await repository.ingestInbound({ ...input, providerMessageId: "review-pause", body: "leave me alone" });
    expect(await new PilotAdmissionRepository(db).isOptedOut(phone)).toBe(true);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.phoneE164, phone));
    expect(user).toMatchObject({ status: "opted_out", phoneVerifiedAt: null, optedOutAt: stopped.optedOutAt });
    // Even a caller reaching website consent cannot replace the SMS STOP.
    await recordWebConsent(new DrizzleConsentRepository(db), { countryCode: "US", callingCode: "+1", areaCode: "202", subscriberNumber: "5550718", consent: true }, { auditKey: "public-test-key" });
    const consents = await db.select().from(schema.consentRecords).where(eq(schema.consentRecords.userId, user.id));
    expect(consents.every(row => row.status === "revoked")).toBe(true);
    expect((await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]).toMatchObject({ status: "opted_out", optedOutAt: stopped.optedOutAt });
    expect(await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, user.id))).toHaveLength(0);
  } finally { await client.close(); }
}, 30000);

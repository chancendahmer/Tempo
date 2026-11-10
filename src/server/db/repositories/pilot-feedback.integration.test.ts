import { readdir, readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { PilotFeedbackRepository } from "./pilot-feedback-repository";
import { DrizzleAccountControlRepository } from "./account-control-repository";
import { FeedbackConflict, FeedbackRateLimited, type PilotFeedbackInput } from "../../domain/pilot-feedback";
import { decryptField } from "../../security/field-encryption";

const key = randomBytes(32).toString("base64");
const input = (change: Partial<PilotFeedbackInput> = {}): PilotFeedbackInput => ({ requestId: randomUUID(), type: "problem", section: "reminders", impact: "blocked", followUpConsent: false, ...change });
describe("private durable pilot feedback", () => {
  let client: PGlite, database: TempoDatabase, repository: PilotFeedbackRepository;
  let owner: string, neighbor: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
    repository = new PilotFeedbackRepository(database);
    const accounts = await database.insert(schema.users).values([
      { phoneE164: "+12025550401", phoneVerifiedAt: new Date() }, { phoneE164: "+12025550402", phoneVerifiedAt: new Date() },
    ]).returning();
    [owner, neighbor] = accounts.map(row => row.id);
  });
  afterAll(async () => client.close());

  it("stores only bounded explicit report data, encrypts detail and scopes receipt reads", async () => {
    const detail = "The reminder save button did not respond.";
    const receipt = await repository.submit(owner, input({ detail, followUpConsent: true }), key);
    expect(await repository.receipt(owner, receipt.id)).toEqual(receipt);
    expect(await repository.receipt(neighbor, receipt.id)).toBeNull();
    const [row] = await database.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.id, receipt.id));
    expect(JSON.stringify(row)).not.toContain(detail);
    expect(decryptField(row.encryptedDetail!, key)).toBe(detail);
    expect(row.followUpConsent).toBe(true);
    const [summary] = await repository.operatorReports(key, { reportId: receipt.id });
    expect(summary).toMatchObject({ id: receipt.id, type: "problem", section: "reminders", impact: "blocked", hasDetail: true, followUpConsent: true });
    expect(JSON.stringify(summary)).not.toContain(detail);
    expect(JSON.stringify(summary)).not.toContain(owner);
    expect(JSON.stringify(summary)).not.toContain("+12025550401");
    expect(summary).not.toHaveProperty("detail");
    await expect(repository.operatorReports(key, { includeDetail: true })).rejects.toThrow("Choose one report");
    expect((await repository.operatorReports(key, { reportId: receipt.id, includeDetail: true }))[0].detail).toBe(detail);
    expect(await database.select().from(schema.conversationMessages)).toHaveLength(0);
    expect(await database.select().from(schema.scheduledActions)).toHaveLength(0);
  });

  it("serializes identical concurrent retries into one receipt without consuming multiple submission slots", async () => {
    const report = input({ detail: "A repeated request." });
    const receipts = await Promise.all(Array.from({ length: 3 }, () => repository.submit(neighbor, report, key)));
    expect(receipts.every(receipt => receipt.id === receipts[0].id)).toBe(true);
    expect(await database.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.userId, neighbor))).toHaveLength(1);
    const [bucket] = await database.select().from(schema.rateLimitBuckets).where(eq(schema.rateLimitBuckets.key, `feedback-write:${neighbor}`));
    expect(bucket.count).toBe(1);
    await expect(repository.submit(neighbor, { ...report, impact: "minor" }, key)).rejects.toBeInstanceOf(FeedbackConflict);
    // The other account can reuse a client request ID without seeing this receipt.
    expect((await repository.submit(owner, report, key)).id).not.toBe(receipts[0].id);
  });

  it("caps new submissions per account, preserves retry receipts at the cap and opens the next window", async () => {
    const [account] = await database.insert(schema.users).values({ phoneE164: "+12025550403", phoneVerifiedAt: new Date() }).returning();
    const now = new Date("2026-10-22T12:05:00Z"), first = input();
    const receipt = await repository.submit(account.id, first, key, now);
    for (let count = 1; count < 5; count++) await repository.submit(account.id, input(), key, now);
    await expect(repository.submit(account.id, input(), key, now)).rejects.toBeInstanceOf(FeedbackRateLimited);
    expect(await repository.submit(account.id, first, key, now)).toEqual(receipt);
    expect(await database.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.userId, account.id))).toHaveLength(5);
    await repository.submit(account.id, input(), key, new Date("2026-10-22T13:00:00Z"));
  });

  it("removes report content and receipts on ordinary account deletion, with other accounts preserved", async () => {
    const [account] = await database.insert(schema.users).values({ phoneE164: "+12025550404", phoneVerifiedAt: new Date() }).returning();
    const receipt = await repository.submit(account.id, input({ detail: "Delete this report with the account." }), key);
    const before = await database.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.userId, owner));
    expect(await new DrizzleAccountControlRepository(database).deleteAccount(account.id)).toBe(true);
    expect(await repository.receipt(account.id, receipt.id)).toBeNull();
    expect(await repository.operatorReports(key, { reportId: receipt.id, includeDetail: true })).toEqual([]);
    expect(await database.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.userId, owner))).toHaveLength(before.length);
    await expect(repository.submit(account.id, input(), key)).rejects.toThrow();
    const [pending] = await database.insert(schema.users).values({ phoneE164: "+12025550405" }).returning();
    await expect(repository.submit(pending.id, input(), key)).rejects.toThrow();
  });
});

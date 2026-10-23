import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AiBudgetReservationInput } from "../../domain/ai-budget";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { DrizzleAiBudgetRepository } from "./ai-budget-repository";

const now = new Date("2026-10-22T23:59:00Z");
const tomorrow = new Date("2026-10-23T01:00:00Z");
const usage = { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, cacheCreation5mInputTokens: 0, cacheCreation1hInputTokens: 0, webSearchRequests: 0 };
const zeroUsage = Object.fromEntries(Object.keys(usage).map((key) => [key, 0])) as typeof usage;
describe("durable AI budget accounting", () => {
  let client: PGlite;
  let database: TempoDatabase;
  let repository: DrizzleAiBudgetRepository;
  let accountId: string;
  const reservation = (overrides: Partial<AiBudgetReservationInput> = {}): AiBudgetReservationInput => ({
    accountId, executionId: randomUUID(), attemptId: randomUUID(), operation: "assistant", model: "synthetic-model", priceVersion: "synthetic-v1", policyVersion: "synthetic-v1", reservedMicrodollars: 10,
    policy: { globalDailyMicrodollars: 20, accountDailyMicrodollars: 20, globalDailyCalls: 2, accountDailyCalls: 2 }, now, ...overrides,
  });
  const states = async () => (await database.execute<{ scope_key: string; outstanding: string; settled: string; calls: string; day: string; halted: boolean }>(sql`select scope_key,outstanding_microdollars::text as outstanding,settled_microdollars::text as settled,settled_calls::text as calls,window_day::text as day,halted from ai_budget_states order by scope_key`)).rows;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
    repository = new DrizzleAiBudgetRepository(database);
  });
  beforeEach(async () => {
    await database.execute(sql`delete from ai_budget_attempts`);
    await database.execute(sql`delete from ai_budget_states`);
    await database.execute(sql`delete from users`);
    const [account] = await database.insert(schema.users).values({ phoneE164: "+12025550172" }).returning({ id: schema.users.id });
    accountId = account.id;
  });
  afterAll(async () => client.close());

  it("atomically reserves both scopes at the exact cap and denies further attempts", async () => {
    const first = reservation();
    expect(await repository.reserve(first)).toMatchObject({ allowed: true, replay: false });
    expect(await repository.reserve(first)).toMatchObject({ allowed: true, replay: true });
    expect(await repository.reserve(reservation())).toMatchObject({ allowed: true });
    expect(await repository.reserve(reservation())).toEqual({ allowed: false, reason: "budget_exhausted" });
    for (const row of await states()) expect(row).toMatchObject({ outstanding: "20", settled: "0" });
  });
  it("rejects reuse of an attempt for another envelope without mutating either scope", async () => {
    const input = reservation();
    await repository.reserve(input);
    expect(await repository.reserve({ ...input, reservedMicrodollars: 9 })).toEqual({ allowed: false, reason: "attempt_conflict" });
    expect((await states()).map((row) => row.outstanding)).toEqual(["10", "10"]);
  });
  it("canonicalizes UUID spelling so casing cannot create independent account headroom", async () => {
    const input = reservation({ policy: { globalDailyMicrodollars: 100, accountDailyMicrodollars: 10, globalDailyCalls: 10, accountDailyCalls: 1 } });
    await repository.reserve(input);
    expect(await repository.reserve({ ...input, accountId: accountId.toUpperCase() })).toMatchObject({ allowed: true, replay: true });
    expect(await repository.reserve({ ...input, attemptId: randomUUID(), accountId: accountId.toUpperCase() })).toEqual({ allowed: false, reason: "budget_exhausted" });
    expect(await states()).toHaveLength(2);
  });
  it("checks boundary additions with integer arithmetic beyond the safe-number sum", async () => {
    const policy = { globalDailyMicrodollars: Number.MAX_SAFE_INTEGER, accountDailyMicrodollars: Number.MAX_SAFE_INTEGER, globalDailyCalls: 10, accountDailyCalls: 10 };
    expect(await repository.reserve(reservation({ policy, reservedMicrodollars: Number.MAX_SAFE_INTEGER - 1 }))).toMatchObject({ allowed: true });
    expect(await repository.reserve(reservation({ policy, reservedMicrodollars: 2 }))).toEqual({ allowed: false, reason: "budget_exhausted" });
    expect(await repository.reserve(reservation({ policy, reservedMicrodollars: 1 }))).toMatchObject({ allowed: true });
    for (const row of await states()) expect(row.outstanding).toBe(String(Number.MAX_SAFE_INTEGER));
  });
  it("grants one submission permission and settles once with conflict detection", async () => {
    const input = reservation();
    await repository.reserve(input);
    expect(await repository.settle({ attemptId: input.attemptId, actualMicrodollars: 5, usage, now })).toBe("conflict");
    expect(await repository.claim(input.attemptId, now)).toBe(true);
    expect(await repository.claim(input.attemptId, now)).toBe(false);
    const settlement = { attemptId: input.attemptId, actualMicrodollars: 5, usage, now };
    expect(await repository.settle(settlement)).toBe("settled");
    expect(await repository.settle(settlement)).toBe("replay");
    expect(await repository.settle({ ...settlement, actualMicrodollars: 6 })).toBe("conflict");
    expect(await repository.claim(input.attemptId, now)).toBe(false);
    for (const row of await states()) expect(row).toMatchObject({ outstanding: "0", settled: "5", calls: "1" });
  });
  it("retains unknown costs and calls over rollover, then releases only authoritative debt", async () => {
    const input = reservation({ reservedMicrodollars: 20 });
    await repository.reserve(input);
    await repository.claim(input.attemptId, now);
    await repository.markUncertain(input.attemptId, "timeout", now);
    expect(await repository.reserve(reservation({ now: tomorrow }))).toEqual({ allowed: false, reason: "budget_exhausted" });
    await repository.settle({ attemptId: input.attemptId, actualMicrodollars: 18, usage, now: tomorrow });
    for (const row of await states()) expect(row).toMatchObject({ outstanding: "0", settled: "0", calls: "0", day: "2026-10-23" });
    expect(await repository.reserve(reservation({ now: tomorrow }))).toMatchObject({ allowed: true });
  });
  it("never refunds abandoned reserved or claimed attempts on a new day", async () => {
    const first = reservation(); const second = reservation();
    await repository.reserve(first); await repository.reserve(second);
    await repository.claim(second.attemptId, now);
    expect(await repository.reserve(reservation({ now: tomorrow }))).toEqual({ allowed: false, reason: "budget_exhausted" });
    for (const row of await states()) expect(row).toMatchObject({ outstanding: "20", settled: "0", calls: "0" });
    const invalidAudit = { attemptId: second.attemptId, actualMicrodollars: 0, usage: zeroUsage, now: tomorrow, reconciliationId: randomUUID(), definitivelyUnsubmitted: true };
    expect(await repository.reconcile(invalidAudit)).toBe("conflict");
    for (const row of await states()) expect(row.outstanding).toBe("20");
  });
  it("never rewinds a UTC window on an earlier clock", async () => {
    await repository.reserve(reservation({ now: tomorrow }));
    expect(await repository.reserve(reservation())).toEqual({ allowed: false, reason: "budget_halted" });
    for (const row of await states()) expect(row.day).toBe("2026-10-23");
  });
  it("independently enforces account and global call caps including zero cost attempts", async () => {
    const policy = { globalDailyMicrodollars: 100, accountDailyMicrodollars: 100, globalDailyCalls: 2, accountDailyCalls: 1 };
    const input = reservation({ policy, reservedMicrodollars: 0 });
    await repository.reserve(input); await repository.claim(input.attemptId, now);
    await repository.settle({ attemptId: input.attemptId, actualMicrodollars: 0, usage: zeroUsage, now });
    expect(await repository.reserve(reservation({ policy, reservedMicrodollars: 0 }))).toEqual({ allowed: false, reason: "budget_exhausted" });
    const [second] = await database.insert(schema.users).values({ phoneE164: "+12025550173" }).returning({ id: schema.users.id });
    expect(await repository.reserve(reservation({ accountId: second.id, policy, reservedMicrodollars: 0 }))).toMatchObject({ allowed: true });
    expect(await repository.reserve(reservation({ accountId: second.id, policy: { ...policy, accountDailyCalls: 10 }, reservedMicrodollars: 0 }))).toEqual({ allowed: false, reason: "budget_exhausted" });
  });
  it("records actual overages and halts paid admission", async () => {
    const input = reservation();
    await repository.reserve(input); await repository.claim(input.attemptId, now);
    const pending = reservation();
    await repository.reserve(pending);
    expect(await repository.settle({ attemptId: input.attemptId, actualMicrodollars: 11, usage, now })).toBe("settled");
    expect(await repository.claim(pending.attemptId, now)).toBe(false);
    expect(await repository.reserve(reservation({ now: tomorrow }))).toEqual({ allowed: false, reason: "budget_halted" });
    for (const row of await states()) expect(row.halted).toBe(true);
  });
  it("requires an independent idempotent audit to release an unclaimed attempt", async () => {
    const input = reservation();
    await repository.reserve(input);
    const reconciliation = { attemptId: input.attemptId, actualMicrodollars: 0, usage: zeroUsage, now, reconciliationId: randomUUID(), definitivelyUnsubmitted: true };
    expect(await repository.reconcile(reconciliation)).toBe("settled");
    expect(await repository.reconcile(reconciliation)).toBe("replay");
    expect(await repository.reconcile({ ...reconciliation, reconciliationId: randomUUID() })).toBe("conflict");
    for (const row of await states()) expect(row).toMatchObject({ outstanding: "0", settled: "0", calls: "0" });
  });
  it("halts on a cheaper usage-bound violation and rejects a changed replay flag", async () => {
    const input = reservation();
    const pending = reservation();
    await repository.reserve(input); await repository.claim(input.attemptId, now);
    await repository.reserve(pending);
    const settlement = { attemptId: input.attemptId, actualMicrodollars: 1, usage, haltAdmission: true, now };
    expect(await repository.settle(settlement)).toBe("settled");
    expect(await repository.settle(settlement)).toBe("replay");
    expect(await repository.settle({ ...settlement, haltAdmission: false })).toBe("conflict");
    expect(await repository.claim(pending.attemptId, now)).toBe(false);
    expect(await repository.reserve(reservation({ now: tomorrow }))).toEqual({ allowed: false, reason: "budget_halted" });
    for (const row of await states()) expect(row.halted).toBe(true);
  });
  it("account deletion preserves anonymous global commitments", async () => {
    const input = reservation({ reservedMicrodollars: 20 });
    await repository.reserve(input); await repository.claim(input.attemptId, now);
    await repository.markUncertain(input.attemptId, "network", now);
    await database.execute(sql`delete from users where id = ${accountId}::uuid`);
    const attempt = (await database.execute<{ account_id: string | null }>(sql`select account_id from ai_budget_attempts`)).rows[0];
    expect(attempt.account_id).toBeNull();
    const [replacement] = await database.insert(schema.users).values({ phoneE164: "+12025550172" }).returning({ id: schema.users.id });
    expect(await repository.reserve(reservation({ accountId: replacement.id, now: tomorrow }))).toEqual({ allowed: false, reason: "budget_exhausted" });
    await repository.settle({ attemptId: input.attemptId, actualMicrodollars: 10, usage, now: tomorrow });
    expect(await repository.reserve(reservation({ accountId: replacement.id, now: tomorrow }))).toMatchObject({ allowed: true });
  });
});

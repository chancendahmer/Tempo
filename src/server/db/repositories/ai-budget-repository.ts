import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { aiBudgetFailureSchema, aiBudgetReconciliationSchema, aiBudgetReservationSchema, aiBudgetSettlementSchema, type AiBudgetFailure, type AiBudgetReconciliationInput, type AiBudgetRepository, type AiBudgetReservationInput, type AiBudgetReservationResult, type AiBudgetSettlementInput, type AiBudgetSettlementResult, type AiBudgetUsage } from "../../domain/ai-budget";
import { getPool, type TempoDatabase } from "../client";
import * as schema from "../schema";

type Transaction = Parameters<Parameters<TempoDatabase["transaction"]>[0]>[0];
type State = { scope_key: string; window_day: string; settled_microdollars: string; settled_calls: string; outstanding_microdollars: string; outstanding_calls: string; halted: boolean };
type Attempt = { id: string; account_key: string; window_day: string; reserved_microdollars: string; actual_microdollars: string | null; state: string; usage: AiBudgetUsage | null; reservation_fingerprint: string; reconciliation_id: string | null; bound_violation: boolean };
function day(now: Date) { return now.toISOString().slice(0, 10); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function clock(now: Date) { return z.date().parse(now); }

/** Short transactions only; provider requests must happen after claim returns.
 * Every transaction locks global state first, then account state, then an attempt.
 * Anonymous UUID hashes and provider debt survive account deletion; retention needs operator review.
 */
export class DrizzleAiBudgetRepository implements AiBudgetRepository {
  // Bypass domain transaction scopes: a later business rollback cannot erase provider debt.
  constructor(private readonly database: TempoDatabase = drizzle(getPool(), { schema })) {}

  private async lockGlobal(transaction: Transaction, now: Date) {
    await transaction.execute(sql`insert into ai_budget_states (scope_key, window_day, updated_at) values ('global', ${day(now)}::date, ${now}) on conflict do nothing`);
    const result = await transaction.execute<State>(sql`select *, window_day::text as window_day from ai_budget_states where scope_key = 'global' for update`);
    return result.rows[0];
  }

  private async lockAccount(transaction: Transaction, key: string) {
    const result = await transaction.execute<State>(sql`select *, window_day::text as window_day from ai_budget_states where scope_key = ${key} for update`);
    if (!result.rows[0]) throw new Error("AI budget state unavailable");
    return result.rows[0];
  }

  private async rollForward(transaction: Transaction, state: State, now: Date) {
    if (day(now) <= state.window_day) return;
    await transaction.execute(sql`update ai_budget_states set window_day = ${day(now)}::date, settled_microdollars = 0, settled_calls = 0, updated_at = ${now} where scope_key = ${state.scope_key}`);
    state.window_day = day(now);
    state.settled_microdollars = "0";
    state.settled_calls = "0";
  }

  async reserve(rawInput: AiBudgetReservationInput): Promise<AiBudgetReservationResult> {
    const { now: suppliedNow, ...input } = aiBudgetReservationSchema.parse(rawInput);
    const now = suppliedNow ?? new Date();
    const accountKey = `account:${hash(input.accountId)}`;
    const fingerprint = hash(JSON.stringify(input));
    return this.database.transaction(async (transaction) => {
      const global = await this.lockGlobal(transaction, now);
      await transaction.execute(sql`insert into ai_budget_states (scope_key,account_id,window_day,updated_at) values (${accountKey},${input.accountId}::uuid,${day(now)}::date,${now}) on conflict do nothing`);
      const account = await this.lockAccount(transaction, accountKey);
      const existing = await transaction.execute<Attempt>(sql`select * from ai_budget_attempts where id = ${input.attemptId}::uuid for update`);
      if (existing.rows[0]) return existing.rows[0].reservation_fingerprint === fingerprint
        ? { allowed: true, attemptId: input.attemptId, replay: true }
        : { allowed: false, reason: "attempt_conflict" };
      if (day(now) < global.window_day || day(now) < account.window_day) return { allowed: false, reason: "budget_halted" };
      await this.rollForward(transaction, global, now);
      await this.rollForward(transaction, account, now);
      if (global.halted || account.halted) return { allowed: false, reason: "budget_halted" };
      const within = (state: State, money: number, calls: number) => BigInt(state.settled_microdollars) + BigInt(state.outstanding_microdollars) + BigInt(input.reservedMicrodollars) <= BigInt(money)
        && BigInt(state.settled_calls) + BigInt(state.outstanding_calls) + BigInt(1) <= BigInt(calls);
      if (!within(global, input.policy.globalDailyMicrodollars, input.policy.globalDailyCalls) || !within(account, input.policy.accountDailyMicrodollars, input.policy.accountDailyCalls)) return { allowed: false, reason: "budget_exhausted" };
      await transaction.execute(sql`insert into ai_budget_attempts (id,account_id,account_key,execution_id,operation,model,price_version,policy_version,reservation_fingerprint,window_day,reserved_microdollars,state,created_at,updated_at) values (${input.attemptId}::uuid,${input.accountId}::uuid,${accountKey},${input.executionId}::uuid,${input.operation},${input.model},${input.priceVersion},${input.policyVersion},${fingerprint},${day(now)}::date,${input.reservedMicrodollars},'reserved',${now},${now})`);
      for (const key of ["global", accountKey]) await transaction.execute(sql`update ai_budget_states set outstanding_microdollars = outstanding_microdollars + ${input.reservedMicrodollars}, outstanding_calls = outstanding_calls + 1, updated_at = ${now} where scope_key = ${key}`);
      return { allowed: true, attemptId: input.attemptId, replay: false };
    });
  }

  async claim(attemptId: string, now = new Date()): Promise<boolean> {
    z.uuid().parse(attemptId); clock(now);
    return this.database.transaction(async (transaction) => {
      const global = await this.lockGlobal(transaction, now);
      if (global.halted || day(now) < global.window_day) return false;
      const result = await transaction.execute<{ id: string }>(sql`update ai_budget_attempts set state = 'submitting', updated_at = ${now} where id = ${attemptId}::uuid and state = 'reserved' returning id`);
      return result.rows.length === 1;
    });
  }

  async markUncertain(attemptId: string, reason: AiBudgetFailure, now = new Date()): Promise<void> {
    z.uuid().parse(attemptId); aiBudgetFailureSchema.parse(reason); clock(now);
    await this.database.transaction(async (transaction) => {
      await this.lockGlobal(transaction, now);
      await transaction.execute(sql`update ai_budget_attempts set state = 'uncertain', failure_category = ${reason}, updated_at = ${now} where id = ${attemptId}::uuid and state = 'submitting'`);
    });
  }

  settle(input: AiBudgetSettlementInput) { return this.finish(aiBudgetSettlementSchema.parse(input)); }
  reconcile(input: AiBudgetReconciliationInput) { return this.finish(aiBudgetReconciliationSchema.parse(input), true); }

  private async finish(input: AiBudgetSettlementInput | AiBudgetReconciliationInput, audited = false): Promise<AiBudgetSettlementResult> {
    const now = input.now ?? new Date();
    return this.database.transaction(async (transaction) => {
      const global = await this.lockGlobal(transaction, now);
      // The global lock serializes attempt/account lookup with all ledger mutations.
      const lookup = await transaction.execute<Attempt>(sql`select *,window_day::text as window_day from ai_budget_attempts where id = ${input.attemptId}::uuid`);
      const attempt = lookup.rows[0];
      if (!attempt) return "conflict";
      const account = await this.lockAccount(transaction, attempt.account_key);
      const reconciliation = audited ? input as AiBudgetReconciliationInput : undefined;
      if (attempt.state === "settled") return BigInt(attempt.actual_microdollars!) === BigInt(input.actualMicrodollars)
        && attempt.bound_violation === Boolean(input.haltAdmission)
        && JSON.stringify(attempt.usage && Object.fromEntries(Object.entries(attempt.usage).sort())) === JSON.stringify(Object.fromEntries(Object.entries(input.usage).sort()))
        && (attempt.reconciliation_id ?? null) === (reconciliation?.reconciliationId ?? null) ? "replay" : "conflict";
      if (attempt.state === "reserved" && (!reconciliation?.definitivelyUnsubmitted || input.actualMicrodollars !== 0 || Object.values(input.usage).some((value) => value !== 0))) return "conflict";
      if (attempt.state !== "reserved" && reconciliation?.definitivelyUnsubmitted) return "conflict";
      await this.rollForward(transaction, global, now);
      await this.rollForward(transaction, account, now);
      const overage = Boolean(input.haltAdmission) || BigInt(input.actualMicrodollars) > BigInt(attempt.reserved_microdollars);
      for (const state of [global, account]) {
        // Late authoritative settlement is attributed to its admission day, never a new day's spend.
        const sameDay = state.window_day === attempt.window_day;
        const submitted = attempt.state !== "reserved";
        await transaction.execute(sql`update ai_budget_states set outstanding_microdollars = outstanding_microdollars - ${attempt.reserved_microdollars}::bigint, outstanding_calls = outstanding_calls - 1, settled_microdollars = settled_microdollars + ${sameDay ? input.actualMicrodollars : 0}, settled_calls = settled_calls + ${sameDay && submitted ? 1 : 0}, halted = halted or ${overage}, updated_at = ${now} where scope_key = ${state.scope_key}`);
      }
      await transaction.execute(sql`update ai_budget_attempts set state = 'settled',actual_microdollars = ${input.actualMicrodollars},usage = ${JSON.stringify(input.usage)}::jsonb,bound_violation = ${Boolean(input.haltAdmission)},reconciliation_id = ${reconciliation?.reconciliationId ?? null}::uuid,updated_at = ${now} where id = ${input.attemptId}::uuid`);
      return "settled";
    });
  }
}

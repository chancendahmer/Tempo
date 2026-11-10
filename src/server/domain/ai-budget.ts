import { z } from "zod";

/** USD microdollars: 1 USD = 1,000,000 units. Public values must be exact JS integers. */
export const aiBudgetIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const aiBudgetOperationSchema = z.enum(["assistant", "turn_authorization", "intervention_review", "intervention_composition", "task_presentation"]);
export type AiBudgetOperation = z.infer<typeof aiBudgetOperationSchema>;
export const aiBudgetPolicySchema = z.object({
  globalDailyMicrodollars: aiBudgetIntegerSchema,
  accountDailyMicrodollars: aiBudgetIntegerSchema,
  globalDailyCalls: aiBudgetIntegerSchema,
  accountDailyCalls: aiBudgetIntegerSchema,
}).strict();
export type AiBudgetPolicy = z.infer<typeof aiBudgetPolicySchema>;
export const aiBudgetUsageSchema = z.object({
  inputTokens: aiBudgetIntegerSchema,
  outputTokens: aiBudgetIntegerSchema,
  cacheCreationInputTokens: aiBudgetIntegerSchema,
  cacheReadInputTokens: aiBudgetIntegerSchema,
  cacheCreation5mInputTokens: aiBudgetIntegerSchema,
  cacheCreation1hInputTokens: aiBudgetIntegerSchema,
  webSearchRequests: aiBudgetIntegerSchema,
}).strict().refine((value) => BigInt(value.cacheCreationInputTokens) === BigInt(value.cacheCreation5mInputTokens) + BigInt(value.cacheCreation1hInputTokens), "Cache creation components must match total");
export type AiBudgetUsage = z.infer<typeof aiBudgetUsageSchema>;
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
const uuid = z.uuid().transform((value) => value.toLowerCase());
export const aiBudgetReservationSchema = z.object({
  attemptId: uuid, accountId: uuid, executionId: uuid,
  operation: aiBudgetOperationSchema, model: identifier, priceVersion: identifier, policyVersion: identifier,
  reservedMicrodollars: aiBudgetIntegerSchema, policy: aiBudgetPolicySchema, now: z.date().optional(),
}).strict();
export type AiBudgetReservationInput = z.infer<typeof aiBudgetReservationSchema>;
export type AiBudgetReservationResult = { allowed: true; attemptId: string; replay: boolean } | { allowed: false; reason: "budget_exhausted" | "budget_halted" | "attempt_conflict" };
export const aiBudgetFailureSchema = z.enum(["timeout", "cancelled", "network", "invalid_usage", "provider_error", "process_failure"]);
export type AiBudgetFailure = z.infer<typeof aiBudgetFailureSchema>;
export const aiBudgetSettlementSchema = z.object({ attemptId: uuid, actualMicrodollars: aiBudgetIntegerSchema, usage: aiBudgetUsageSchema, haltAdmission: z.boolean().optional(), now: z.date().optional() }).strict();
export type AiBudgetSettlementInput = z.infer<typeof aiBudgetSettlementSchema>;
/** An independent audit is required. This API never guesses whether a timed-out request was billable. */
export const aiBudgetReconciliationSchema = aiBudgetSettlementSchema.extend({ reconciliationId: uuid, definitivelyUnsubmitted: z.boolean() });
export type AiBudgetReconciliationInput = z.infer<typeof aiBudgetReconciliationSchema>;
export type AiBudgetSettlementResult = "settled" | "replay" | "conflict";
export interface AiBudgetRepository {
  reserve(input: AiBudgetReservationInput): Promise<AiBudgetReservationResult>;
  claim(attemptId: string, now?: Date): Promise<boolean>;
  markUncertain(attemptId: string, reason: AiBudgetFailure, now?: Date): Promise<void>;
  settle(input: AiBudgetSettlementInput): Promise<AiBudgetSettlementResult>;
  reconcile(input: AiBudgetReconciliationInput): Promise<AiBudgetSettlementResult>;
}

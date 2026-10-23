import type Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireEnv } from "../../config/env";
import { DrizzleAiBudgetRepository } from "../../db/repositories/ai-budget-repository";
import { buildAdmissionEnvelope, priceUsage } from "./ai-pricing";
import { AssistantProviderFailure } from "../../domain/assistant-provider-failure";
import { currentAiInvocationScope } from "../../domain/ai-invocation-scope";
import type { AiBudgetOperation, AiBudgetPolicy, AiBudgetRepository, AiBudgetUsage } from "../../domain/ai-budget";

export class AiBudgetDeniedError extends AssistantProviderFailure {
  constructor() { super("budget"); }
}

export type PaidAdmissionEnvelope = {
  model: string; priceVersion: string; policyVersion: string;
  reservedMicrodollars: number; policy: AiBudgetPolicy;
};
export type PaidInvocationDependencies<E extends PaidAdmissionEnvelope = PaidAdmissionEnvelope> = {
  enabled: boolean;
  repository: AiBudgetRepository;
  admit(request: MessageCreateParamsNonStreaming, now: Date): E;
  price(envelope: E, usage: unknown, model: string): { actualMicrodollars: number; usage: AiBudgetUsage; haltAdmission?: boolean };
};

export async function invokePaidMessage(client: Anthropic, request: MessageCreateParamsNonStreaming, operation: AiBudgetOperation): Promise<Message> {
  let mode: string;
  try {
    mode = requireEnv([]).AI_BUDGET_MODE;
  } catch { throw new AiBudgetDeniedError(); }
  if (mode === "off") return client.messages.create(request);
  if (mode !== "enforce" || !currentAiInvocationScope()) throw new AiBudgetDeniedError();
  // SDK environment overrides can change the provider; this price snapshot is
  // only for Anthropic's direct API, not an unpriced proxy or cloud deployment.
  if (client.baseURL !== "https://api.anthropic.com") throw new AiBudgetDeniedError();
  let repository: AiBudgetRepository;
  try { repository = new DrizzleAiBudgetRepository(); }
  catch { throw new AiBudgetDeniedError(); }
  return meteredMessage(client, request, operation, {
    enabled: true, repository, admit: buildAdmissionEnvelope, price: priceUsage,
  });
}

/** Each invocation owns a fresh physical attempt, even for parser continuations or worker retries. */
export async function meteredMessage<E extends PaidAdmissionEnvelope>(
  client: Anthropic, request: MessageCreateParamsNonStreaming, operation: AiBudgetOperation,
  dependencies: PaidInvocationDependencies<E>,
): Promise<Message> {
  if (!dependencies.enabled) return client.messages.create(request);
  const scope = currentAiInvocationScope();
  if (!scope) throw new AiBudgetDeniedError();
  let attemptId: string;
  let envelope: E;
  try {
    z.uuid().parse(scope.accountId);
    z.uuid().parse(scope.executionId);
    scope.signal?.throwIfAborted();
    // Keep the admitted envelope and the network payload identical while the
    // accounting transactions await; callers cannot mutate a reserved request.
    request = structuredClone(request);
    if (request.service_tier !== undefined && request.service_tier !== "standard_only") throw new AiBudgetDeniedError();
    request.service_tier = "standard_only";
    envelope = dependencies.admit(request, new Date());
    attemptId = randomUUID();
    const reservation = await dependencies.repository.reserve({
      accountId: scope.accountId, executionId: scope.executionId, attemptId, operation,
      model: envelope.model, priceVersion: envelope.priceVersion, policyVersion: envelope.policyVersion,
      reservedMicrodollars: envelope.reservedMicrodollars, policy: envelope.policy,
    });
    if (!reservation.allowed || !await dependencies.repository.claim(attemptId)) throw new AiBudgetDeniedError();
  } catch { throw new AiBudgetDeniedError(); }

  let response: Message;
  try {
    response = await client.messages.create(request, { maxRetries: 0, signal: scope.signal });
  } catch (error) {
    const reason = scope.signal?.aborted ? "cancelled"
      : error instanceof Error && error.name === "APIConnectionTimeoutError" ? "timeout" : "provider_error";
    try { await dependencies.repository.markUncertain(attemptId, reason); } catch { /* Submission debt remains reserved. */ }
    throw error;
  }
  let priced: { actualMicrodollars: number; usage: AiBudgetUsage; haltAdmission?: boolean };
  try {
    priced = dependencies.price(envelope, response.usage, response.model);
  } catch {
    try { await dependencies.repository.markUncertain(attemptId, "invalid_usage"); } catch { /* No refund on unavailable accounting. */ }
    throw new AiBudgetDeniedError();
  }
  try {
    const result = await dependencies.repository.settle({ attemptId, ...priced });
    if (result === "conflict") throw new AiBudgetDeniedError();
  } catch {
    try { await dependencies.repository.markUncertain(attemptId, "process_failure"); } catch { /* No refund on unavailable accounting. */ }
    throw new AiBudgetDeniedError();
  }
  return response;
}

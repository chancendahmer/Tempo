import { beforeEach, expect, it, vi } from "vitest";
import { AnthropicInterventionDecisionReviewer } from "./intervention-decision-reviewer";
import { AiBudgetDeniedError } from "./paid-invocation";
import { evaluateContext, DEFAULT_CONTEXT_POLICY, type ContextSignals } from "../../domain/context-engine";
import type { InterventionDecisionReviewer } from "../../domain/context-evaluation-service";

const { create, construct } = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(options: unknown) { construct(options); } messages = { create }; } }));
vi.mock("../../config/env", () => ({ requireEnv: () => ({ AI_BUDGET_MODE: "off", ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "fixture-model" }) }));
const now = new Date("2026-10-22T12:00:00Z");
const signals: ContextSignals = {
  userId: "synthetic", status: "active", onboardingComplete: true, hasConsent: true, proactiveOptIn: true, timezone: "UTC",
  calendarBusy: false, calendarAvailable: true, freeMinutes: 120, dailyInterventionCount: 0, dailyInterventionCap: 3,
  interventionCooldownMinutes: 240, hasPendingResponse: false, responseRate: 0.8,
  coachingTone: "balanced", repeatedNonStarts: 0, bodyDoublingAffinity: false,
  tasks: [{ id: "task", title: "Outline", status: "not_started", dueAt: new Date("2026-10-22T13:00:00Z"), createdAt: now }],
};
const policy = { id: "fixture-policy", ...DEFAULT_CONTEXT_POLICY, holdoutBasisPoints: 0 };
const input: Parameters<InterventionDecisionReviewer["review"]>[0] = { now, signals, policy, evaluation: evaluateContext({ now, signals, policy, shadowMode: false }) };
beforeEach(() => vi.clearAllMocks());

it("vetoes budget denial even when the ordinary provider fallback would approve", async () => {
  create.mockRejectedValue(new AiBudgetDeniedError());
  expect(await new AnthropicInterventionDecisionReviewer().review({ ...input, evaluation: { ...input.evaluation, score: policy.threshold + 0.2 } }))
    .toMatchObject({ send: false, reason: "ai_budget_denied" });
});

it.each(["APIConnectionTimeoutError", "RateLimitError"])("preserves the deterministic failure policy after %s with bounded SDK work", async name => {
  create.mockRejectedValue(Object.assign(new Error("Synthetic unavailable provider"), { name }));
  const reviewer = new AnthropicInterventionDecisionReviewer();
  expect(await reviewer.review({ ...input, evaluation: { ...input.evaluation, score: policy.threshold + 0.1 } })).toMatchObject({ send: false, reason: "ai_review_unavailable_fail_closed", model: "deterministic-fallback" });
  expect(await reviewer.review({ ...input, evaluation: { ...input.evaluation, score: policy.threshold + 0.2 } })).toMatchObject({ send: true, reason: "deterministic_high_confidence_fallback", model: "deterministic-fallback" });
  expect(construct).toHaveBeenCalledExactlyOnceWith({ apiKey: "test-only", timeout: 15_000, maxRetries: 0 });
  expect(create).toHaveBeenCalledTimes(2);
});

it("preserves an explicit model veto and treats invalid model decisions as failure", async () => {
  create.mockResolvedValueOnce({ content: [{ type: "tool_use", name: "review_intervention", input: { send: false, reason: "Too weak" } }] })
    .mockResolvedValueOnce({ content: [{ type: "tool_use", name: "review_intervention", input: { send: "true", reason: "Invalid" } }] });
  const reviewer = new AnthropicInterventionDecisionReviewer();
  expect(await reviewer.review(input)).toEqual({ send: false, reason: "Too weak", model: "fixture-model" });
  expect(await reviewer.review({ ...input, evaluation: { ...input.evaluation, score: policy.threshold + 0.1 } })).toMatchObject({ send: false, reason: "ai_review_unavailable_fail_closed" });
});

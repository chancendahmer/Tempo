import { describe, expect, it, vi } from "vitest";
import { ContextEngineRepository, InterventionOpportunityPlanner, evaluateUserContext } from "./context-evaluation-service";
import { ContextSignals, DEFAULT_CONTEXT_POLICY } from "./context-engine";

describe("context evaluation idempotency", () => {
  it("never plans from a duplicate opportunity whose persisted snapshot is authoritative", async () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const signals: ContextSignals = {
      userId: "user-1", status: "active", onboardingComplete: true, hasConsent: true, timezone: "UTC",
      calendarBusy: false, calendarAvailable: true, freeMinutes: 120, dailyInterventionCount: 0, dailyInterventionCap: 3,
      interventionCooldownMinutes: 240, hasPendingResponse: false, responseRate: 0.8,
      coachingTone: "balanced", repeatedNonStarts: 0, bodyDoublingAffinity: false,
      tasks: [{ id: "task-1", title: "Report", status: "not_started", dueAt: new Date("2026-08-18T13:00:00Z"), createdAt: now }],
    };
    const repository: ContextEngineRepository = {
      getActivePolicy: async () => ({ id: "policy-1", ...DEFAULT_CONTEXT_POLICY, holdoutBasisPoints: 0 }),
      loadSignals: async () => signals,
      saveSnapshot: async () => ({ id: "existing-snapshot", created: false }),
    };
    const plan = vi.fn(async () => "intervention-1");
    const planner: InterventionOpportunityPlanner = { plan };
    const result = await evaluateUserContext({ userId: signals.userId, repository, planner, shadowMode: false, now });
    expect(result).toMatchObject({ evaluated: true, snapshotId: "existing-snapshot", snapshotCreated: false });
    if (!result.evaluated) throw new Error("expected evaluation");
    expect(result.evaluation.decision).toBe("send");
    expect(plan).not.toHaveBeenCalled();
  });

  it("lets the bounded AI reviewer veto a deterministically eligible candidate and audits why", async () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const signals: ContextSignals = {
      userId: "user-2", status: "active", onboardingComplete: true, hasConsent: true, timezone: "UTC",
      calendarBusy: false, calendarAvailable: true, freeMinutes: 120, dailyInterventionCount: 0, dailyInterventionCap: 3,
      interventionCooldownMinutes: 5, hasPendingResponse: false, responseRate: 0.8,
      coachingTone: "balanced", repeatedNonStarts: 0, bodyDoublingAffinity: false,
      tasks: [{ id: "task-2", title: "Report", status: "not_started", dueAt: new Date("2026-08-18T13:00:00Z"), createdAt: now }],
    };
    let persistedDecision: string | undefined;
    let persistedInputs: Record<string, unknown> | undefined;
    const repository: ContextEngineRepository = {
      getActivePolicy: async () => ({ id: "policy-2", ...DEFAULT_CONTEXT_POLICY, holdoutBasisPoints: 0 }),
      loadSignals: async () => signals,
      saveSnapshot: async (input) => {
        persistedDecision = input.evaluation.decision;
        persistedInputs = input.evaluation.inputs;
        return { id: "reviewed-snapshot", created: true };
      },
    };
    const plan = vi.fn(async () => "never");
    const result = await evaluateUserContext({
      userId: signals.userId,
      repository,
      planner: { plan },
      reviewer: { review: async () => ({ send: false, reason: "context too weak", model: "test-reviewer" }) },
      shadowMode: false,
      now,
    });
    expect(result.evaluated && result.evaluation.reasonCodes).toContain("ai_review_skip");
    expect(persistedDecision).toBe("blocked");
    expect(persistedInputs).toMatchObject({ hybridReview: { send: false, reason: "context too weak", model: "test-reviewer" } });
    expect(plan).not.toHaveBeenCalled();
  });
});

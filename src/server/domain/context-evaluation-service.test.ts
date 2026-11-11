import { describe, expect, it, vi } from "vitest";
import { ContextEngineRepository, InterventionOpportunityPlanner, evaluateUserContext } from "./context-evaluation-service";
import { ContextSignals, DEFAULT_CONTEXT_POLICY } from "./context-engine";

describe("context evaluation idempotency", () => {
  it("never plans from a duplicate opportunity whose persisted snapshot is authoritative", async () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const signals: ContextSignals = {
      userId: "user-1", status: "active", onboardingComplete: true, hasConsent: true, proactiveOptIn: true, timezone: "UTC",
      calendarBusy: false, calendarAvailable: true, freeMinutes: 120, dailyInterventionCount: 0, dailyInterventionCap: 3,
      interventionCooldownMinutes: 240, hasPendingResponse: false, responseRate: 0.8,
      coachingTone: "balanced", repeatedNonStarts: 0, bodyDoublingAffinity: false,
      tasks: [{ id: "task-1", title: "Report", status: "not_started", dueAt: new Date("2026-08-18T13:00:00Z"), createdAt: now }],
    };
    const repository: ContextEngineRepository = {
      getActivePolicy: async () => ({ id: "policy-1", ...DEFAULT_CONTEXT_POLICY, holdoutBasisPoints: 0 }),
      loadSignals: async () => signals,
      saveSnapshot: async () => ({ id: "existing-snapshot", created: false }),
      completeReview: vi.fn(),
    };
    const plan = vi.fn(async () => "intervention-1");
    const planner: InterventionOpportunityPlanner = { plan };
    const result = await evaluateUserContext({ userId: signals.userId, repository, planner, shadowMode: false, now });
    expect(result).toMatchObject({ evaluated: true, snapshotId: "existing-snapshot", snapshotCreated: false });
    if (!result.evaluated) throw new Error("expected evaluation");
    expect(result.evaluation.decision).toBe("send");
    expect(plan).not.toHaveBeenCalled();
  });

  it("reserves a blocked snapshot before review and calls the reviewer once for concurrent evaluation", async () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const signals: ContextSignals = {
      userId: "user-2", status: "active", onboardingComplete: true, hasConsent: true, proactiveOptIn: true, timezone: "UTC",
      calendarBusy: false, calendarAvailable: true, freeMinutes: 120, dailyInterventionCount: 0, dailyInterventionCap: 3,
      interventionCooldownMinutes: 5, hasPendingResponse: false, responseRate: 0.8,
      coachingTone: "balanced", repeatedNonStarts: 0, bodyDoublingAffinity: false,
      tasks: [{ id: "task-2", title: "Report", status: "not_started", dueAt: new Date("2026-08-18T13:00:00Z"), createdAt: now }],
    };
    let pending: Parameters<ContextEngineRepository["saveSnapshot"]>[0]["evaluation"] | undefined;
    const completeReview = vi.fn<ContextEngineRepository["completeReview"]>();
    const repository: ContextEngineRepository = {
      getActivePolicy: async () => ({ id: "policy-2", ...DEFAULT_CONTEXT_POLICY, holdoutBasisPoints: 0 }),
      loadSignals: async () => signals,
      saveSnapshot: async (input) => {
        if (pending) return { id: "reviewed-snapshot", created: false };
        pending = input.evaluation;
        return { id: "reviewed-snapshot", created: true };
      },
      completeReview,
    };
    const plan = vi.fn(async () => "never");
    const review = vi.fn(async () => {
      expect(pending).toMatchObject({ decision: "blocked", reasonCodes: expect.arrayContaining(["ai_review_pending"]) });
      return { send: false, reason: "context too weak", model: "test-reviewer" };
    });
    const evaluate = () => evaluateUserContext({
      userId: signals.userId,
      repository,
      planner: { plan },
      reviewer: { review },
      shadowMode: false,
      now,
    });
    const [first, second] = await Promise.all([evaluate(), evaluate()]);
    const result = first.evaluated && first.snapshotCreated ? first : second;
    const duplicate = result === first ? second : first;
    expect(result.evaluated && result.evaluation.reasonCodes).toContain("ai_review_skip");
    expect(duplicate.evaluated && duplicate.evaluation.reasonCodes).toContain("opportunity_already_evaluated");
    expect(review).toHaveBeenCalledOnce();
    expect(completeReview).toHaveBeenCalledExactlyOnceWith("reviewed-snapshot", signals.userId, expect.objectContaining({
      decision: "blocked", inputs: expect.objectContaining({ hybridReview: { send: false, reason: "context too weak", model: "test-reviewer" } }),
    }));
    expect(plan).not.toHaveBeenCalled();
  });
});

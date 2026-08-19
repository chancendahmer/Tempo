import { describe, expect, it } from "vitest";
import { ContextPolicy, ContextSignals, DEFAULT_CONTEXT_POLICY, evaluateContext, isQuietTime, selectTask } from "./context-engine";

const now = new Date("2026-08-18T14:00:00Z");
const policy: ContextPolicy = { id: "policy-1", ...DEFAULT_CONTEXT_POLICY };
const baseSignals: ContextSignals = {
  userId: "user-1",
  status: "active",
  onboardingComplete: true,
  hasConsent: true,
  timezone: "America/New_York",
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  calendarBusy: false,
  calendarAvailable: true,
  freeMinutes: 120,
  dailyInterventionCount: 0,
  dailyInterventionCap: 3,
  minutesSinceLastIntervention: 1_500,
  interventionCooldownMinutes: 240,
  hasPendingResponse: false,
  responseRate: 0.75,
  coachingTone: "balanced",
  preferredCoachingStyle: null,
  repeatedNonStarts: 0,
  bodyDoublingAffinity: false,
  tasks: [{ id: "task-1", title: "Report", status: "not_started", dueAt: new Date("2026-08-18T18:00:00Z"), estimatedMinutes: 60, createdAt: now }],
};

describe("context engine", () => {
  it("logs an above-threshold opportunity as shadow without authorizing a send", () => {
    const evaluation = evaluateContext({ signals: baseSignals, policy, now, shadowMode: true });
    expect(evaluation.decision).toBe("shadow");
    expect(evaluation.reasonCodes).toContain("above_threshold_shadow");
    expect(evaluation.score).toBeGreaterThan(policy.threshold);
    expect(Object.keys(evaluation.scoreBreakdown)).toEqual(["taskUrgency", "freeTime", "idleGap", "responseRate", "recentContact"]);
  });

  it.each([
    ["quiet_hours", { timezone: "UTC", quietHoursStart: "13:00", quietHoursEnd: "15:00" }],
    ["calendar_busy", { calendarBusy: true }],
    ["daily_cap_reached", { dailyInterventionCount: 3 }],
    ["pending_response", { hasPendingResponse: true }],
    ["cooldown_active", { minutesSinceLastIntervention: 30 }],
  ])("hard-blocks %s regardless of score", (reason, override) => {
    const evaluation = evaluateContext({ signals: { ...baseSignals, ...override }, policy, now, shadowMode: false });
    expect(evaluation.decision).toBe("blocked");
    expect(evaluation.reasonCodes).toContain(reason);
    expect(evaluation.scoreBreakdown).toBeDefined();
  });

  it("handles overnight quiet hours in the user's timezone", () => {
    expect(isQuietTime(new Date("2026-08-18T03:00:00Z"), "UTC", "22:00", "07:00")).toBe(true);
    expect(isQuietTime(new Date("2026-08-18T14:00:00Z"), "UTC", "22:00", "07:00")).toBe(false);
  });

  it("selects the most urgent task deterministically", () => {
    const selected = selectTask([
      { id: "later", title: "Later", status: "in_progress", dueAt: new Date("2026-08-21T14:00:00Z"), createdAt: now },
      { id: "today", title: "Today", status: "not_started", dueAt: new Date("2026-08-18T16:00:00Z"), createdAt: now },
    ], now, 168);
    expect(selected?.id).toBe("today");
  });

  it("assigns non-shadow opportunities to a reproducible holdout", () => {
    const holdoutPolicy = { ...policy, holdoutBasisPoints: 10_000 };
    const first = evaluateContext({ signals: baseSignals, policy: holdoutPolicy, now, shadowMode: false });
    const replay = evaluateContext({ signals: baseSignals, policy: holdoutPolicy, now, shadowMode: false });
    expect(first.decision).toBe("holdout");
    expect(first.randomizedBucket).toBe(replay.randomizedBucket);
    expect(first.inputs.opportunityKey).toBe(replay.inputs.opportunityKey);
  });

  it("does not treat missing or stale calendar data as free time", () => {
    const evaluation = evaluateContext({
      signals: { ...baseSignals, calendarAvailable: false, freeMinutes: 120 },
      policy,
      now,
      shadowMode: true,
    });
    expect(evaluation.scoreBreakdown.freeTime).toBe(0);
    expect(evaluation.inputs.calendarAvailable).toBe(false);
    expect(evaluation.reasonCodes).not.toContain("calendar_busy");
  });
});

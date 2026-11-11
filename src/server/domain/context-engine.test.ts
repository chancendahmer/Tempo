import { describe, expect, it } from "vitest";
import { ContextPolicy, ContextSignals, DEFAULT_CONTEXT_POLICY, evaluateContext, isQuietTime, LINKED_THOUGHT_WINDOW_MS, WORKSPACE_ACTIVITY_WINDOW_MS } from "./context-engine";
import { proactiveDeliveryEnabled } from "../config/proactive-delivery";

const now = new Date("2026-08-18T14:00:00Z");
const policy: ContextPolicy = { id: "policy-1", ...DEFAULT_CONTEXT_POLICY };
const baseSignals: ContextSignals = {
  userId: "user-1",
  status: "active",
  onboardingComplete: true,
  hasConsent: true, proactiveOptIn: true,
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
const emptyWorkspace = { focusUntil: null, routines: [], latestActivityAt: null, linkedThoughts: new Map<string, Date>() };
const evaluate = (overrides: Partial<ContextSignals> = {}) => evaluateContext({
  signals: { ...baseSignals, ...overrides }, policy: { ...policy, holdoutBasisPoints: 0 }, now, shadowMode: false,
});

describe("context engine", () => {
  it("holds proactive nudges during conversation and allows the exact five-minute boundary", () => {
    const evaluate = (age: number) => evaluateContext({ signals: { ...baseSignals, lastUserMessageAt: new Date(now.getTime() - age) }, policy: { ...policy, holdoutBasisPoints: 0 }, now, shadowMode: false });
    expect(evaluate(299_999)).toMatchObject({ decision: "blocked", reasonCodes: expect.arrayContaining(["recent_conversation"]) });
    expect(evaluate(300_000).decision).toBe("send");
    expect(evaluate(300_001).decision).toBe("send");
  });
  it.each<[string, Partial<ContextSignals>]>([
    ["proactive_opt_in_missing", { proactiveOptIn: false }],
    ["quiet_hours", { timezone: "UTC", quietHoursStart: "13:00", quietHoursEnd: "15:00" }],
    ["calendar_busy", { calendarBusy: true }],
    ["daily_cap_reached", { dailyInterventionCount: 3 }],
  ])("canary permission cannot bypass %s", (reason, override) => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const shadowMode = !proactiveDeliveryEnabled({ INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [userId] }, userId);
    expect(shadowMode).toBe(false);
    const result = evaluateContext({ signals: { ...baseSignals, userId, ...override }, policy, now, shadowMode });
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).toContain(reason);
  });
  it("logs an above-threshold opportunity as shadow without authorizing a send", () => {
    const evaluation = evaluateContext({ signals: baseSignals, policy, now, shadowMode: true });
    expect(evaluation.decision).toBe("shadow");
    expect(evaluation.reasonCodes).toContain("above_threshold_shadow");
    expect(evaluation.score).toBeGreaterThan(policy.threshold);
    expect(evaluation.scoreBreakdown).toMatchObject({ linkedThought: 0, routineOverlap: 0, recentWorkspaceActivity: 0 });
  });

  it.each<[string, Partial<ContextSignals>]>([
    ["proactive_opt_in_missing", { proactiveOptIn: false }],
    ["consent_missing", { hasConsent: false }],
    ["onboarding_incomplete", { onboardingComplete: false }],
    ["user_opted_out", { status: "opted_out" }],
    ["active_focus", { workspace: { ...emptyWorkspace, focusUntil: new Date(now.getTime() + 1) } }],
    ["cooldown_active", { interventionCooldownMinutes: 5, minutesSinceLastIntervention: 119 }],
    ["daily_cap_reached", { dailyInterventionCap: 10, dailyInterventionCount: 3 }],
    ["quiet_hours", { timezone: "UTC", quietHoursStart: "13:00", quietHoursEnd: "15:00" }],
    ["calendar_busy", { calendarBusy: true }],
    ["daily_cap_reached", { dailyInterventionCount: 3 }],
    ["pending_response", { hasPendingResponse: true }],
    ["cooldown_active", { minutesSinceLastIntervention: 30 }],
    ["no_checkin_window", { freeMinutes: 4 }],
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

  it("selects the strongest actionable task using both urgency and how it fits the window", () => {
    const tasks: ContextSignals["tasks"] = [
      { id: "later", title: "Later", status: "in_progress", dueAt: new Date("2026-08-21T14:00:00Z"), createdAt: now },
      { id: "today", title: "Today", status: "not_started", dueAt: new Date("2026-08-18T16:00:00Z"), estimatedMinutes: 180, createdAt: now },
    ];
    expect(evaluate({ tasks, freeMinutes: 240 }).task?.id).toBe("today");
    expect(evaluate({ tasks, freeMinutes: 30 }).task?.id).toBe("later");
    expect(evaluate({ tasks: [...tasks].reverse(), freeMinutes: 30 }).task?.id).toBe("later");
  });

  it("keeps recently overdue work ahead of a more distant deadline when both fit", () => {
    const recent = { ...baseSignals.tasks[0], id: "recent", dueAt: new Date("2026-08-18T13:30:00Z") };
    const distant = { ...recent, id: "distant", dueAt: new Date("2026-08-21T14:00:00Z") };
    const soon = { ...recent, dueAt: new Date("2026-08-18T14:30:00Z") };

    expect(evaluate({ tasks: [distant, recent] })).toMatchObject({ task: { id: recent.id }, decision: "send" });
    expect(evaluate({ tasks: [recent] }).scoreBreakdown.taskUrgency).toBeCloseTo(evaluate({ tasks: [soon] }).scoreBreakdown.taskUrgency, 10);
  });

  it("keeps an old deadline below threshold unless a fresh linked Thought raises its relevance", () => {
    const old = { ...baseSignals.tasks[0], dueAt: new Date("2026-08-01T14:00:00Z") };
    const signals = { tasks: [old], responseRate: 1 };

    expect(evaluate(signals)).toMatchObject({ decision: "blocked", reasonCodes: ["below_threshold"], scoreBreakdown: { taskUrgency: 0 } });
    expect(evaluate({ ...signals, workspace: { ...emptyWorkspace, linkedThoughts: new Map([[old.id, now]]) } })).toMatchObject({
      task: { id: old.id }, decision: "send", scoreBreakdown: { taskUrgency: 0, linkedThought: 0.08 },
    });
  });

  it("defers a strong task when an unfinished saved routine overlaps recent workspace activity", () => {
    const routine = { time: "10:00", steps: [{ minutes: 20, completedOn: null }] };
    const evaluation = evaluate({ workspace: { ...emptyWorkspace, routines: [routine], latestActivityAt: now } });
    expect(evaluate().decision).toBe("send");
    expect(evaluation).toMatchObject({ decision: "blocked", reasonCodes: ["below_threshold"], scoreBreakdown: { routineOverlap: -0.24, recentWorkspaceActivity: -0.16 } });
  });

  it("ignores completed and elapsed routines, ended focus, and expired or future activity", () => {
    const routines = [
      { time: "10:00", steps: [{ minutes: 20, completedOn: "2026-08-18" }] },
      { time: "09:40", steps: [{ minutes: 20, completedOn: null }] },
    ];
    for (const latestActivityAt of [new Date(now.getTime() - WORKSPACE_ACTIVITY_WINDOW_MS), new Date(now.getTime() + 1)]) {
      const result = evaluate({ workspace: { ...emptyWorkspace, focusUntil: now, routines, latestActivityAt } });
      expect(result.score).toBe(evaluate().score);
      expect(result.decision).toBe("send");
    }
  });

  it("prioritizes a fresh task-linked Thought while ignoring stale, future, or unrelated links", () => {
    const first = { ...baseSignals.tasks[0], id: "a" };
    const second = { ...first, id: "b" };
    const rank = (thoughts: [string, Date][]) => evaluate({
      tasks: [first, second], workspace: { ...emptyWorkspace, linkedThoughts: new Map(thoughts) },
    });
    expect(rank([["b", now]])).toMatchObject({ task: { id: "b" }, scoreBreakdown: { linkedThought: 0.08 } });
    expect(rank([["b", new Date(now.getTime() - LINKED_THOUGHT_WINDOW_MS)]])).toMatchObject({ task: { id: "a" }, scoreBreakdown: { linkedThought: 0 } });
    expect(rank([["b", new Date(now.getTime() + 1)], ["unrelated", now]])).toMatchObject({ task: { id: "a" }, scoreBreakdown: { linkedThought: 0 } });
  });

  it("keeps standalone app activity and a weak unscheduled task below send eligibility", () => {
    const workspace = { ...emptyWorkspace, latestActivityAt: now, linkedThoughts: new Map([["unrelated", now]]) };
    expect(evaluate({ workspace, tasks: [] })).toMatchObject({ decision: "blocked", reasonCodes: ["no_actionable_task"] });
    expect(evaluate({ workspace, tasks: [{ ...baseSignals.tasks[0], dueAt: null }] })).toMatchObject({ decision: "blocked", reasonCodes: ["below_threshold"] });
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
    expect(evaluation.reasonCodes).toContain("calendar_unavailable");
    expect(evaluation.decision).toBe("blocked");
    expect(evaluation.reasonCodes).not.toContain("calendar_busy");
  });
});

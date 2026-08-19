import { describe, expect, it } from "vitest";
import { ContextSignals, ContextTask } from "./context-engine";
import { fallbackIntervention, selectInterventionStyle, validateInterventionMessage } from "./intervention-strategy";

const now = new Date("2026-08-18T12:00:00Z");
const task: ContextTask = { id: "task", title: "Report", status: "not_started", createdAt: now };
const signals: ContextSignals = {
  userId: "user", status: "active", onboardingComplete: true, hasConsent: true, timezone: "UTC",
  calendarBusy: false, calendarAvailable: true, freeMinutes: 120, dailyInterventionCount: 0, dailyInterventionCap: 3,
  interventionCooldownMinutes: 240, hasPendingResponse: false, responseRate: 0.5,
  coachingTone: "balanced", preferredCoachingStyle: null, repeatedNonStarts: 0, bodyDoublingAffinity: false, tasks: [task],
};

describe("intervention strategy", () => {
  it("covers all five strategies with deterministic rules", () => {
    expect(selectInterventionStyle(task, signals, now)).toBe("micro_start");
    expect(selectInterventionStyle({ ...task, dueAt: new Date("2026-08-18T13:00:00Z") }, signals, now)).toBe("direct_nudge");
    expect(selectInterventionStyle({ ...task, estimatedMinutes: 120 }, signals, now)).toBe("task_breakdown");
    expect(selectInterventionStyle(task, { ...signals, bodyDoublingAffinity: true }, now)).toBe("body_doubling");
    expect(selectInterventionStyle(task, {
      ...signals,
      repeatedNonStarts: 2,
      nextFreeAt: new Date("2026-08-18T15:00:00Z"),
    }, now)).toBe("reschedule");
  });

  it("never proposes a vague reschedule when calendar context is unavailable", () => {
    expect(selectInterventionStyle({
      ...task,
      estimatedMinutes: 45,
      dueAt: new Date("2026-08-18T13:00:00Z"),
    }, {
      ...signals,
      calendarAvailable: false,
      freeMinutes: 0,
      nextFreeAt: null,
      repeatedNonStarts: 3,
    }, now)).toBe("direct_nudge");
  });

  it("provides short, concrete safe fallbacks", () => {
    for (const style of ["micro_start", "direct_nudge", "task_breakdown", "body_doubling", "reschedule"] as const) {
      expect(validateInterventionMessage(fallbackIntervention({ style, taskTitle: "Report", freeMinutes: 60, tone: "balanced", memories: [] })).length).toBeLessThanOrEqual(320);
    }
    expect(() => validateInterventionMessage("You are lazy and should have started.")).toThrow("safety constraints");
  });
});

import { describe, expect, it } from "vitest";
import { workoutCompletionDateError } from "./workout";
import type { LifeItem } from "./life-items";

describe("completed workout dates", () => {
  const now = new Date("2026-10-22T02:00:00Z");
  const workout: Extract<LifeItem, { kind: "workout" }> = { kind: "workout", title: "Walk", date: "2026-10-22", minutes: 20, activity: "Walk" };
  it("compares with the account's local day across a UTC boundary", () => {
    expect(workoutCompletionDateError(workout, now, "America/New_York")).toContain("today or an earlier date");
    expect(workoutCompletionDateError(workout, now, "Pacific/Kiritimati")).toBeNull();
    expect(workoutCompletionDateError({ ...workout, date: "2026-10-21" }, now, "America/New_York")).toBeNull();
  });
  it("allows reusable plans and future meal planning", () => {
    expect(workoutCompletionDateError({ kind: "workout_plan", title: "My plan", templateId: "walking-mobility", sessions: [{ name: "Walk", minutes: 20, exercises: [{ name: "Walk", dose: "20 minutes" }] }] }, now, "America/New_York")).toBeNull();
    expect(workoutCompletionDateError({ kind: "meal", title: "Lunch", date: "2027-01-14", meal: "Lunch", ingredients: "Rice" }, now, "America/New_York")).toBeNull();
  });
});

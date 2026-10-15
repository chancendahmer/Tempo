import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildWorkoutPlan, WorkoutPlanEditor, type WorkoutPlanDraft } from "./WorkoutPlanEditor";
import { buildWorkoutLog } from "./WorkoutLogEditor";
import { exerciseAlternative, workoutPrograms, workoutTaskDraft } from "./workout-programs";
import { lifeItemSchema } from "../../server/domain/life-items";
const draft = (): WorkoutPlanDraft => ({ title: "My two days", templateId: "full-body", sessions: workoutPrograms[0].sessions.map(session => ({ ...session, minutes: String(session.minutes), exercises: session.exercises.map(exercise => ({ ...exercise })) })) });

describe("saved workout plans", () => {
  it("offers six usable templates with equipment, experience, rest, and substitutions", () => {
    expect(workoutPrograms.map(program => program.id)).toEqual(["full-body", "upper-lower", "push-pull-legs", "calisthenics", "at-home", "walking-mobility"]);
    for (const program of workoutPrograms) {
      expect(program.equipment).toBeTruthy(); expect(program.experience).toBeTruthy(); expect(program.rest).toBeTruthy();
      expect(lifeItemSchema.safeParse({ kind: "workout_plan", title: program.title, templateId: program.id, sessions: program.sessions }).success).toBe(true);
      for (const session of program.sessions) for (const exercise of session.exercises) expect(exerciseAlternative(exercise), exercise.name).toBeTruthy();
    }
  });
  it("persists customized sessions without modifying the source template or inventing completion", () => {
    const value = draft(); value.sessions[0].exercises[0].name = "Sit-to-stand"; value.sessions[0].minutes = "20";
    const saved = buildWorkoutPlan(value);
    expect(saved.sessions[0].exercises[0].name).toBe("Sit-to-stand");
    expect(saved.sessions[0].minutes).toBe(20);
    expect(workoutPrograms[0].sessions[0].exercises[0].name).not.toBe("Sit-to-stand");
    expect(saved.kind).toBe("workout_plan");
    expect(saved).not.toHaveProperty("date");
    expect(workoutTaskDraft(saved, saved.sessions[0])).not.toHaveProperty("status");
  });
  it("rejects ambiguous session names and invalid duration or empty movements", () => {
    const value = draft(); value.sessions[1].name = value.sessions[0].name;
    expect(() => buildWorkoutPlan(value)).toThrow("different name");
    for (const minutes of ["", "0", "1441", "1.5", "NaN"]) { const value = draft(); value.sessions[0].minutes = minutes; expect(() => buildWorkoutPlan(value)).toThrow("whole minutes"); }
    const empty = draft(); empty.sessions[0].exercises = []; expect(() => buildWorkoutPlan(empty)).toThrow("Add a movement");
  });
  it("retains the session name when a long saved plan name becomes a scheduled task", () => {
    const session = workoutPrograms[0].sessions[0];
    const task = workoutTaskDraft({ title: "A".repeat(240) }, session);
    expect(task.title.length).toBeLessThanOrEqual(240);
    expect(task.title.endsWith(` · ${session.name}`)).toBe(true);
  });
  it("blocks saving a plan removed or changed elsewhere", () => {
    const item = { id: "plan-1", version: 1, data: buildWorkoutPlan(draft()) };
    const html = renderToStaticMarkup(createElement(WorkoutPlanEditor, { program: workoutPrograms[0], item, latestItem: { ...item, version: 2 }, saving: false, save: async () => true, close: () => {} }));
    expect(html).toContain("plan changed or was removed elsewhere");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });
});

describe("completed movement", () => {
  const values = { title: "My session", date: "2026-10-15", minutes: "22", activity: "Strength" as const, notes: "One fewer set today" };
  it("records actual duration and preserves the saved plan link", () => {
    const result = buildWorkoutLog(values, "2026-10-15", { programId: "00000000-0000-4000-8000-000000000001", sessionName: "Session A", minutes: 35 });
    expect(result).toMatchObject({ kind: "workout", minutes: 22, notes: values.notes, sessionName: "Session A" });
    expect(result.programId).toBeTruthy();
  });
  it("does not record a future workout as completed", () => {
    expect(() => buildWorkoutLog(values, "2026-10-14")).toThrow("earlier date");
    expect(() => buildWorkoutLog({ ...values, minutes: "0" }, "2026-10-15")).toThrow("whole minutes");
  });
});

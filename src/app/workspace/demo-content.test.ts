import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { lifeItemSchema, localDay } from "../../server/domain/life-items";
import { previewWorkspace } from "./workspace-data";
import { demoRecipes, recipePhotoFor, savedDemoRecipe } from "./demo-recipes";
import { workoutPrograms, workoutTaskDraft } from "./workout-programs";
import { todayModel } from "./today-model";

describe("investor demo content", () => {
  const now = new Date(2026, 9, 14, 10, 0);
  it("uses valid saved records, unique IDs and real goal links", () => {
    const data = previewWorkspace(now);
    const ids = [...data.items, ...data.tasks, ...data.goals, ...data.reminders, ...data.messages, ...data.memories!].map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of data.items) expect(lifeItemSchema.safeParse(item.data).success, item.data.title).toBe(true);
    for (const task of data.tasks) if (task.goalId) expect(data.goals.some(goal => goal.id === task.goalId)).toBe(true);
    expect(data.tasks.some(task => task.status === "completed")).toBe(true);
    expect(data.calendar).toBeNull(); // No fabricated live Google connection.
  });
  it("keeps menu dates local and spans seven days across month boundaries", () => {
    const data = previewWorkspace(new Date(2026, 9, 30, 23, 50));
    const meals = data.items.filter(item => item.data.kind === "meal");
    const dates = meals.map(item => item.data.kind === "meal" ? item.data.date : "");
    expect(new Set(dates).size).toBe(7);
    expect(dates).toContain("2026-11-05");
    expect(dates[0]).toBe(localDay(new Date(2026, 9, 30, 23, 50), data.timezone));
  });
  it("shares the same sample events between Today and Calendar", () => {
    const data = previewWorkspace(now);
    const event = data.demoCalendarEvents![0];
    expect(data.busy[0]).toEqual({ id: event.id, startsAt: event.startsAt, endsAt: event.endsAt });
    expect(todayModel(data, now).events.find(item => item.id === event.id)?.title).toBe(event.title);
  });
  it("has local photos for the supplied dishes, but does not mislabel edited meals", () => {
    for (const recipe of demoRecipes) {
      expect(existsSync(join(process.cwd(), "public", recipe.image))).toBe(true);
      const saved = savedDemoRecipe(recipe);
      expect(recipePhotoFor(saved)?.alt).toBe(recipe.alt);
      expect(recipePhotoFor({ ...saved, ingredients: "Different ingredients" })).toBeUndefined();
      expect(recipePhotoFor({ ...saved, title: "Different dish" })).toBeUndefined();
      expect(saved).not.toHaveProperty("image");
    }
  });
  it("provides actionable programs and identifies their planned tasks without inventing completion", () => {
    const data = previewWorkspace(now);
    for (const program of workoutPrograms) for (const session of program.sessions) {
      const draft = workoutTaskDraft(program, session);
      expect(draft.estimatedMinutes).toBeGreaterThan(0);
      expect(session.exercises.length).toBeGreaterThanOrEqual(4);
      expect(draft).not.toHaveProperty("status");
    }
    const planned = workoutTaskDraft(workoutPrograms[0], workoutPrograms[0].sessions[0]);
    expect(data.tasks.some(task => task.title === planned.title && task.status === "not_started")).toBe(true);
    expect(data.items.some(item => item.data.kind === "workout" && item.data.title === planned.title)).toBe(false);
  });
  it("labels the seeded AI transcript and nutrition estimates as illustrative", () => {
    const data = previewWorkspace(now);
    expect(data.messages[0].body).toContain("not a live AI response");
    expect(data.messages.filter(message => ["received", "processing"].includes(message.status))).toHaveLength(0);
    for (const item of data.items) if (item.data.kind === "food") expect(item.data.title).toContain("sample estimate");
  });
});

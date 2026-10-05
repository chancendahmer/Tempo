import { describe, expect, it } from "vitest";
import { applyLifePatch, lifePatchSchema } from "./life-patch";
import { assistantCommandSchema } from "./assistant-commands";
import type { LifeItem } from "./life-items";

const id = "00000000-0000-4000-8000-000000000091";
describe("surgical life edits", () => {
  it("changes servings without regenerating ingredients, instructions or other recipe fields", () => {
    const recipe: LifeItem = { kind: "recipe", title: "Lemon rice", ingredients: "Rice\nLemon\nFeta", instructions: "Cook rice.\nAdd lemon.\nTop with feta.", servings: 2, prepMinutes: 20, favorite: true };
    expect(applyLifePatch(recipe, { kind: "recipe", servings: 3 }, () => id)).toEqual({ ...recipe, servings: 3 });
    expect(assistantCommandSchema.safeParse({ type: "life_save", id, version: 1, data: { ...recipe, ingredients: "Rice", servings: 3 } }).success).toBe(false);
    expect(lifePatchSchema.safeParse({ kind: "recipe" }).success).toBe(false);
  });
  it("preserves routine identity/progress across time and step changes, and owns new step IDs", () => {
    const stepId = "00000000-0000-4000-8000-000000000092";
    const routine: LifeItem = { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [{ id: stepId, title: "Water", minutes: 2, completedOn: "2026-09-30" }] };
    expect(applyLifePatch(routine, { kind: "routine", time: "08:30" }, () => id)).toEqual({ ...routine, time: "08:30" });
    const updated = applyLifePatch(routine, { kind: "routine", stepChanges: [{ operation: "update", stepId, minutes: 3 }, { operation: "add", title: "Stretch", minutes: 5 }] }, () => id);
    expect(updated).toEqual({ ...routine, steps: [{ ...routine.steps[0], minutes: 3 }, { id, title: "Stretch", minutes: 5, completedOn: null }] });
    expect(lifePatchSchema.safeParse({ kind: "routine", steps: [] }).success).toBe(false);
    expect(lifePatchSchema.safeParse({ kind: "routine", stepChanges: [{ operation: "update", stepId, completedOn: null }] }).success).toBe(false);
    expect(lifePatchSchema.safeParse({ kind: "routine", stepChanges: [{ operation: "add", id, title: "Fake", minutes: 2, completedOn: "2026-09-30" }] }).success).toBe(false);
    expect(() => applyLifePatch(routine, { kind: "routine", stepChanges: [{ operation: "update", stepId: id, minutes: 3 }] }, () => id)).toThrow(/unavailable/);
    expect(() => applyLifePatch(routine, { kind: "note", body: "Changed kind" }, () => id)).toThrow(/type cannot change/);
  });

  it("reorders and removes only named routine steps without mutating the stored input", () => {
    const second = "00000000-0000-4000-8000-000000000092";
    const routine: LifeItem = { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [
      { id, title: "Water", minutes: 2, completedOn: "2026-09-30" },
      { id: second, title: "Stretch", minutes: 5, completedOn: null },
    ] };
    const reordered = applyLifePatch(routine, { kind: "routine", stepChanges: [{ operation: "reorder", stepIds: [second, id] }] }, () => id);
    expect(reordered).toEqual({ ...routine, steps: [routine.steps[1], routine.steps[0]] });
    expect(routine.steps.map(step => step.id)).toEqual([id, second]);
    expect(applyLifePatch(routine, { kind: "routine", stepChanges: [{ operation: "remove", stepId: second }] }, () => id)).toEqual({ ...routine, steps: [routine.steps[0]] });
    expect(() => applyLifePatch(routine, { kind: "routine", stepChanges: [{ operation: "reorder", stepIds: [id, id] }] }, () => id)).toThrow(/exactly once/);
    expect(() => applyLifePatch(routine, { kind: "routine", stepChanges: [{ operation: "reorder", stepIds: [id] }] }, () => id)).toThrow(/exactly once/);
  });
});

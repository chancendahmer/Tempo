import { z } from "zod";
import { lifeItemSchema, type LifeItem } from "./life-items";

const stepChangeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add"), title: z.string().trim().min(1).max(240), minutes: z.number().int().min(1).max(180), afterStepId: z.uuid().optional() }).strict(),
  z.object({ operation: z.literal("update"), stepId: z.uuid(), title: z.string().trim().min(1).max(240).optional(), minutes: z.number().int().min(1).max(180).optional() }).strict()
    .refine(value => value.title !== undefined || value.minutes !== undefined, "Specify a step field to change"),
  z.object({ operation: z.literal("remove"), stepId: z.uuid() }).strict(),
  z.object({ operation: z.literal("reorder"), stepIds: z.array(z.uuid()).max(30) }).strict(),
]);

// Edit payloads contain only changed fields. Routine identity and progress are
// never writable by a model; additions receive identities inside the transaction.
export const lifePatchSchema = z.discriminatedUnion("kind", [
  lifeItemSchema.options[1].omit({ steps: true }).partial().extend({ kind: z.literal("routine"), stepChanges: z.array(stepChangeSchema).min(1).max(30).optional() }).strict(),
  lifeItemSchema.options[2].partial().extend({ kind: z.literal("food") }).strict(),
  lifeItemSchema.options[3].partial().extend({ kind: z.literal("recipe") }).strict(),
  lifeItemSchema.options[4].partial().extend({ kind: z.literal("meal") }).strict(),
  lifeItemSchema.options[5].partial().extend({ kind: z.literal("workout") }).strict(),
  lifeItemSchema.options[6].partial().extend({ kind: z.literal("note") }).strict(),
  lifeItemSchema.options[7].partial().extend({ kind: z.literal("grocery") }).strict(),
]).refine(value => Object.keys(value).some(key => key !== "kind"), "Specify at least one changed field");
export type LifePatch = z.infer<typeof lifePatchSchema>;

export function applyLifePatch(existing: LifeItem, input: LifePatch, createId: () => string): LifeItem {
  const patch = lifePatchSchema.parse(input);
  if (existing.kind !== patch.kind) throw new Error("An item's type cannot change.");
  if (existing.kind !== "routine" || patch.kind !== "routine") return lifeItemSchema.parse({ ...existing, ...patch });
  const { stepChanges, ...fields } = patch;
  let steps = existing.steps.map(step => ({ ...step }));
  for (const change of stepChanges ?? []) {
    if (change.operation === "reorder") {
      if (change.stepIds.length !== steps.length || new Set(change.stepIds).size !== steps.length || change.stepIds.some(id => !steps.some(step => step.id === id))) {
        throw new Error("Read the routine again and include each current step exactly once when reordering.");
      }
      steps = change.stepIds.map(id => steps.find(step => step.id === id)!);
    } else if (change.operation === "add") {
      const index = change.afterStepId ? steps.findIndex(step => step.id === change.afterStepId) : steps.length - 1;
      if (change.afterStepId && index < 0) throw new Error("That routine step is unavailable. Read the routine again.");
      steps.splice(index + 1, 0, { id: createId(), title: change.title, minutes: change.minutes, completedOn: null });
    } else {
      const index = steps.findIndex(step => step.id === change.stepId);
      if (index < 0) throw new Error("That routine step is unavailable. Read the routine again.");
      if (change.operation === "remove") steps.splice(index, 1);
      else steps[index] = { ...steps[index], ...(change.title !== undefined ? { title: change.title } : {}), ...(change.minutes !== undefined ? { minutes: change.minutes } : {}) };
    }
  }
  return lifeItemSchema.parse({ ...existing, ...fields, steps });
}

export function lifeSavedReply(data: LifeItem, updated = false): string {
  const details = data.kind === "recipe" ? `Serves ${data.servings}.`
    : data.kind === "routine" ? `${data.time}, ${data.steps.length} steps.`
    : data.kind === "food" ? `${data.meal}, ${data.date}; ${data.calories === null ? "calories unknown" : `${data.calories} calories`}, ${data.protein === null ? "protein unknown" : `${data.protein}g protein`}.`
    : data.kind === "meal" ? `${data.meal}, ${data.date}.${data.servings ? ` ${data.servings} ${data.servings === 1 ? "serving" : "servings"}.` : ""}`
    : data.kind === "workout" ? `${data.minutes} minutes, ${data.date}.` : "";
  return `${updated ? "Updated" : "Saved"}: ${data.title}.${details ? ` ${details}` : ""}`;
}

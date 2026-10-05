import type { TaskIntentParser } from "../../src/server/adapters/llm/task-intent-parser";
import type { LifeItem, SavedLifeItem } from "../../src/server/domain/life-items";
import { lifePatchSchema } from "../../src/server/domain/life-patch";
import type { AssistantSimulator } from "./assistant-simulator";

export type Workspace = Awaited<ReturnType<Awaited<ReturnType<AssistantSimulator["user"]>>["workspace"]>>;
export type Step = { message: string; channel: "sms" | "web"; create?: LifeItem; edit?: { kind: "recipe" | "meal"; patch: Record<string, unknown> }; remove?: "note"; task?: "create" | "complete"; goal?: "create"; verify: (workspace: Workspace) => boolean };
const has = (workspace: Workspace, kind: LifeItem["kind"], predicate: (data: LifeItem) => boolean = () => true) => workspace.items.some(row => row.data.kind === kind && predicate(row.data));

/** Fixed dates intentionally make the isolated journey repeatable in either model mode. */
export const workspaceJourney: Step[] = [
  { channel: "sms", message: "Save this recipe: Lemon rice. Ingredients: rice and lemon. Cook rice and add lemon. Serves 2, takes 20 minutes.", create: { kind: "recipe", title: "Lemon rice", ingredients: "Rice\nLemon", instructions: "Cook rice and add lemon.", servings: 2, prepMinutes: 20, favorite: true }, verify: w => has(w, "recipe", d => d.kind === "recipe" && d.servings === 2) },
  { channel: "web", message: "Make that recipe serve four instead. Keep the other details.", edit: { kind: "recipe", patch: { servings: 4 } }, verify: w => w.items.filter(r => r.data.kind === "recipe").length === 1 && has(w, "recipe", d => d.kind === "recipe" && d.servings === 4 && d.prepMinutes === 20) },
  { channel: "sms", message: "Plan Lemon rice for dinner on January 14, 2027. Ingredients are rice and lemon. I have not eaten it yet.", create: { kind: "meal", title: "Lemon rice", date: "2027-01-14", meal: "Dinner", ingredients: "Rice\nLemon" }, verify: w => has(w, "meal") && !has(w, "food") },
  { channel: "web", message: "Move that dinner to January 15, 2027 instead.", edit: { kind: "meal", patch: { date: "2027-01-15" } }, verify: w => has(w, "meal", d => d.kind === "meal" && d.date === "2027-01-15") && w.tasks.length === 0 },
  { channel: "sms", message: "Log my breakfast on January 14, 2027: yogurt, 100 calories and 8 grams of protein. Other nutrients are unknown.", create: { kind: "food", title: "Yogurt", date: "2027-01-14", meal: "Breakfast", calories: 100, protein: 8, carbs: null, fat: null, fiber: null }, verify: w => has(w, "food", d => d.kind === "food" && d.calories === 100 && d.protein === 8 && d.carbs === null && d.fat === null && d.fiber === null) },
  { channel: "web", message: "Save my morning routine at 8 AM: drink water for 2 minutes, then stretch for 5 minutes.", create: { kind: "routine", title: "Morning routine", period: "morning", time: "08:00", steps: [{ id: "00000000-0000-4000-8000-000000000081", title: "Drink water", minutes: 2, completedOn: null }, { id: "00000000-0000-4000-8000-000000000082", title: "Stretch", minutes: 5, completedOn: null }] }, verify: w => has(w, "routine", d => d.kind === "routine" && d.steps.length === 2 && d.time === "08:00") },
  { channel: "sms", message: "Log a 20 minute walk on January 14, 2027.", create: { kind: "workout", title: "Walk", date: "2027-01-14", minutes: 20, activity: "Walk" }, verify: w => has(w, "workout", d => d.kind === "workout" && d.minutes === 20) },
  { channel: "web", message: "Add oats to my grocery list.", create: { kind: "grocery", title: "Oats", checked: false }, verify: w => has(w, "grocery") },
  { channel: "sms", message: "Save a note titled Garden idea: plant lavender beside the door.", create: { kind: "note", title: "Garden idea", body: "Plant lavender beside the door." }, verify: w => has(w, "note") },
  { channel: "web", message: "Delete the Garden idea note.", remove: "note", verify: w => !has(w, "note") },
  { channel: "sms", message: "Add a task to write the report", task: "create", verify: w => w.tasks.some(t => /write the report/i.test(t.title)) },
  { channel: "web", message: "Done with write the report", task: "complete", verify: w => w.tasks.some(t => /write the report/i.test(t.title) && t.status === "completed") },
  { channel: "sms", message: "My goal is to run a half marathon", goal: "create", verify: w => w.goals.some(g => /half marathon/i.test(g.title)) },
  { channel: "web", message: "Show my saved recipes", verify: w => has(w, "recipe", d => d.kind === "recipe" && d.servings === 4) },
];

export const scriptedWorkspaceParser: TaskIntentParser = { parse: async input => {
  const step = workspaceJourney.find(step => step.message === input.message);
  if (step?.create) return { kind: "command", command: { type: "life_save", data: step.create } };
  if (step?.edit || step?.remove) {
    const kind = step.edit?.kind ?? step.remove!;
    const { items: rows } = JSON.parse(await input.execute!({ type: "life_list", kind })) as { items: SavedLifeItem[] };
    const row = rows[0];
    if (!row) return { kind: "conversation", reply: "[SCRIPTED] No item found." };
    if (step.remove) return { kind: "command", command: { type: "life_remove", id: row.id, version: row.version } };
    return { kind: "command", command: { type: "life_patch", id: row.id, version: row.version, patch: lifePatchSchema.parse({ kind: row.data.kind, ...step.edit!.patch }) } };
  }
  return { kind: "command", command: { type: "life_list", kind: "recipe" } };
} };

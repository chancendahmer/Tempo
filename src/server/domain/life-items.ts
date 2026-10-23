import { z } from "zod";
import type { TaskPresentation } from "./task-presentation";

const title = z.string().trim().min(1).max(240);
const day = z.iso.date();
const number = z.number().min(0).max(10000);
const nutrient = number.nullable();
export const groceryUnitSchema = z.enum(["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "oz", "lb", "piece", "slice", "clove", "can", "package"]);
const quantity = z.number().positive().max(1000000000);
export const lifeItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("focus"), title, taskId: z.uuid().optional(), routineId: z.uuid().optional(), stepId: z.uuid().optional(), endsAt: z.iso.datetime().nullable(), remaining: z.number().int().min(0).max(86400) }),
  z.object({ kind: z.literal("routine"), title, period: z.enum(["morning", "evening"]), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), steps: z.array(z.object({ id: z.uuid(), title, minutes: z.number().int().min(1).max(180), completedOn: day.nullable().default(null) })).max(30) }),
  z.object({ kind: z.literal("food"), title, date: day, meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]), calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient, fiber: nutrient, barcode: z.string().regex(/^\d{8,14}$/).optional(), amount: z.number().positive().max(10000).optional(), unit: z.enum(["g", "ml"]).optional(), source: z.enum(["manual", "openfoodfacts"]).optional(), favorite: z.boolean().optional() }),
  z.object({ kind: z.literal("recipe"), title, ingredients: z.string().max(10000), instructions: z.string().max(10000), servings: z.number().int().min(1).max(100), prepMinutes: z.number().int().min(0).max(1440), favorite: z.boolean() }),
  z.object({ kind: z.literal("meal"), title, date: day, meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]), ingredients: z.string().max(4000), servings: z.number().int().min(1).max(100).optional(), ingredientServings: z.number().int().min(1).max(100).optional(), groceriesEnabled: z.boolean().optional() }),
  z.object({ kind: z.literal("workout"), title, date: day, minutes: z.number().int().min(1).max(1440), activity: z.enum(["Walk", "Strength", "Cardio", "Mobility", "Other"]), programId: z.uuid().optional(), sessionName: title.optional(), notes: z.string().max(4000).optional() }),
  z.object({ kind: z.literal("note"), title, body: z.string().max(10000), taskId: z.uuid().optional() }),
  z.object({ kind: z.literal("grocery"), title, checked: z.boolean(), quantity: quantity.optional(), unit: groceryUnitSchema.optional(), mealSources: z.array(z.object({ mealId: z.uuid(), quantity: quantity.nullable() })).max(1000).optional() }),
  z.object({ kind: z.literal("pantry"), title, quantity: quantity.optional(), unit: groceryUnitSchema.optional() }),
  z.object({ kind: z.literal("workout_plan"), title, templateId: z.string().trim().min(1).max(100), sessions: z.array(z.object({ name: title, minutes: z.number().int().min(1).max(1440), exercises: z.array(z.object({ name: title, dose: title })).min(1).max(30) })).min(1).max(30) }),
  z.object({ kind: z.literal("nutrition_target"), title, calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient, fiber: nutrient }),
]);
export type LifeItem = z.infer<typeof lifeItemSchema>;
export type ThoughtTask = { id: string; title: string; status: string; estimatedMinutes: number | null; dueAt: string | null; startedAt: string | null; goalId: string | null; presentation?: TaskPresentation | null };
export type SavedLifeItem = { id: string; version: number; data: LifeItem; linkedTask?: ThoughtTask | null };
export function localDay(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

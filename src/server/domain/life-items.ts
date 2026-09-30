import { z } from "zod";

const title = z.string().trim().min(1).max(240);
const day = z.iso.date();
const number = z.number().min(0).max(10000);
const nutrient = number.nullable();
export const lifeItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("focus"), title, taskId: z.uuid().optional(), routineId: z.uuid().optional(), stepId: z.uuid().optional(), endsAt: z.iso.datetime().nullable(), remaining: z.number().int().min(0).max(86400) }),
  z.object({ kind: z.literal("routine"), title, period: z.enum(["morning", "evening"]), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), steps: z.array(z.object({ id: z.uuid(), title, minutes: z.number().int().min(1).max(180), completedOn: day.nullable().default(null) })).max(30) }),
  z.object({ kind: z.literal("food"), title, date: day, meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]), calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient, fiber: nutrient, barcode: z.string().regex(/^\d{8,14}$/).optional(), amount: z.number().positive().max(10000).optional(), unit: z.enum(["g", "ml"]).optional(), source: z.enum(["manual", "openfoodfacts"]).optional() }),
  z.object({ kind: z.literal("recipe"), title, ingredients: z.string().max(10000), instructions: z.string().max(10000), servings: z.number().int().min(1).max(100), prepMinutes: z.number().int().min(0).max(1440), favorite: z.boolean() }),
  z.object({ kind: z.literal("meal"), title, date: day, meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]), ingredients: z.string().max(4000), servings: z.number().int().min(1).max(100).optional() }),
  z.object({ kind: z.literal("workout"), title, date: day, minutes: z.number().int().min(1).max(1440), activity: z.enum(["Walk", "Strength", "Cardio", "Mobility", "Other"]) }),
  z.object({ kind: z.literal("note"), title, body: z.string().max(10000) }),
  z.object({ kind: z.literal("grocery"), title, checked: z.boolean() }),
]);
export type LifeItem = z.infer<typeof lifeItemSchema>;
export type SavedLifeItem = { id: string; version: number; data: LifeItem };
export function localDay(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

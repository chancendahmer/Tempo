import { z } from "zod";

export const homeModeSchema = z.enum(["auto", "morning", "focus", "meal", "workout", "evening"]);
export type HomeMode = z.infer<typeof homeModeSchema>;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const homePreferencesSchema = z.object({
  pinned: homeModeSchema.default("auto"),
  morningTime: clock.nullable().default(null),
  dinnerTime: clock.default("18:00"),
  eveningTime: clock.nullable().default(null),
  workoutLeadMinutes: z.number().int().min(0).max(120).default(45),
});
export type HomePreferences = z.infer<typeof homePreferencesSchema>;
export function readHomePreferences(value: unknown): HomePreferences {
  const result = homePreferencesSchema.safeParse(value);
  return result.success ? result.data : homePreferencesSchema.parse({});
}

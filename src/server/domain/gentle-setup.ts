import { z } from "zod";
import { ianaTimezoneSchema } from "./timezone";

export const workspacePreferencesSchema = z.object({
  setupStatus: z.enum(["new", "skipped", "complete"]).default("new"),
  showStreak: z.boolean().default(true),
  timezoneConfirmedAt: z.iso.datetime().optional(),
});
export type WorkspacePreferences = z.infer<typeof workspacePreferencesSchema>;

export const gentleSetupActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }).strict(),
  z.object({ action: z.literal("timezone"), timezone: ianaTimezoneSchema }).strict(),
  z.object({
    action: z.literal("save"),
    displayName: z.string().trim().max(80).optional(),
    coachingTone: z.enum(["gentle", "balanced", "direct"]).optional(),
    showStreak: z.boolean().optional(),
  }).strict(),
]);
export type GentleSetupAction = z.infer<typeof gentleSetupActionSchema>;
export type GentleSetup = WorkspacePreferences & {
  displayName: string | null;
  coachingTone: "gentle" | "balanced" | "direct";
  timezone?: string;
};

export function readWorkspacePreferences(value: unknown): WorkspacePreferences {
  const parsed = workspacePreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : { setupStatus: "new", showStreak: true };
}

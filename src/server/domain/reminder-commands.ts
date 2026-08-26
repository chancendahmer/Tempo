import { z } from "zod";

export const reminderCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_reminder"),
    text: z.string().trim().min(1).max(500),
    remindAt: z.iso.datetime({ offset: true }),
    recurrence: z.enum(["daily", "weekdays", "weekly"]).optional(),
    taskId: z.uuid().optional(),
  }),
  z.object({ type: z.literal("list_reminders") }),
  z.object({
    type: z.literal("cancel_reminder"),
    reminderId: z.uuid().optional(),
    reminderQuery: z.string().trim().min(1).max(500).optional(),
  }).refine((command) => command.reminderId || command.reminderQuery, {
    message: "A reminder ID or description is required.",
  }),
]);

export type ReminderCommand = z.infer<typeof reminderCommandSchema>;

export function isExplicitReminderRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return [
    /\bremind me\b/,
    /\b(?:text|message|ping|alert|notify) me\b/,
    /\b(?:send|give) me (?:a )?reminder\b/,
    /\bcheck in with me\b/,
    /\breach out to me\b/,
  ].some((pattern) => pattern.test(normalized));
}

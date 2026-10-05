import { z } from "zod";

export const reminderCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_reminders"), reminders: z.array(z.object({ text: z.string().trim().min(1).max(500), remindAt: z.iso.datetime({ offset: true }) }).strict()).min(2).max(8) }).strict(),
  z.object({ type: z.literal("reschedule_reminders"), changes: z.array(z.object({ reminderId: z.uuid(), expectedRemindAt: z.iso.datetime({ offset: true }), remindAt: z.iso.datetime({ offset: true }) }).strict()).min(2).max(8) }).strict(),
  z.object({
    type: z.literal("create_reminder"),
    text: z.string().trim().min(1).max(500),
    remindAt: z.iso.datetime({ offset: true }),
    recurrence: z.enum(["daily", "weekdays", "weekly"]).optional(),
    taskId: z.uuid().optional(),
  }),
  z.object({ type: z.literal("list_reminders") }),
  z.object({
    type: z.literal("reschedule_reminder"),
    reminderId: z.uuid().optional(),
    reminderQuery: z.string().trim().min(1).max(500).optional(),
    remindAt: z.iso.datetime({ offset: true }),
  }).refine((command) => command.reminderId || command.reminderQuery, { message: "A reminder reference is required." }),
  z.object({
    type: z.literal("complete_reminder"),
    reminderId: z.uuid().optional(),
    reminderQuery: z.string().trim().min(1).max(500).optional(),
  }).refine((command) => command.reminderId || command.reminderQuery, { message: "A reminder reference is required." }),
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
    /\b(?:send|give) me (?:a )?(?:(?:morning|evening|nightly|daily) )?reminder\b/,
    /\bcheck in with me\b/,
    /\breach out to me\b/,
  ].some((pattern) => pattern.test(normalized));
}

/** Resolve simple relative durations with arithmetic rather than model timezone guesses. */
export function relativeReminderTime(message: string, now: Date): string | undefined {
  if (!isExplicitReminderRequest(message) || /\b(?:cancel|stop|disable|turn off|don't|do not|every|daily|weekly|weekday|if|unless)\b/i.test(message)) return undefined;
  const matches = [...message.matchAll(/\bin\s+(\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|an?|half an?)\s+(minutes?|mins?|hours?|hrs?)\b/gi)];
  if (matches.length !== 1) return undefined;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, a: 1, an: 1, "half a": 0.5, "half an": 0.5 };
  const amount = words[matches[0][1].toLowerCase()] ?? Number(matches[0][1]);
  const minutes = amount * (/^(hour|hr)/i.test(matches[0][2]) ? 60 : 1);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 43_200) return undefined;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

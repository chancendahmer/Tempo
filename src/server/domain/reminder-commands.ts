import { z } from "zod";

export const reminderCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_reminders"), reminders: z.array(z.object({ text: z.string().trim().min(1).max(500), remindAt: z.iso.datetime({ offset: true }) }).strict()).min(2).max(8) }).strict(),
  z.object({ type: z.literal("reschedule_reminders"), changes: z.array(z.object({ reminderId: z.uuid(), expectedRemindAt: z.iso.datetime({ offset: true }), remindAt: z.iso.datetime({ offset: true }) }).strict()).min(2).max(8) }).strict(),
  z.object({ type: z.literal("cancel_reminders"), reminders: z.array(z.object({ reminderId: z.uuid(), expectedRemindAt: z.iso.datetime({ offset: true }) }).strict()).min(2).max(8) }).strict(),
  z.object({
    type: z.literal("create_reminder"),
    contentMode: z.enum(["text", "daily_rundown"]).optional(),
    text: z.string().trim().min(1).max(500),
    remindAt: z.iso.datetime({ offset: true }),
    recurrence: z.enum(["daily", "weekdays", "weekly"]).optional(),
    taskId: z.uuid().optional(),
  }),
  z.object({ type: z.literal("list_reminders"), includePast: z.boolean().optional() }),
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

const reminderRequests = [
  /\bremind me\b/i,
  /\b(?:text|message|ping|alert|notify) me\b/i,
  /\b(?:send|give) me (?:a )?(?:(?:morning|evening|nightly|daily) )?reminder\b/i,
  /\bcheck in with me\b/i,
  /\breach out to me\b/i,
];

export function isExplicitReminderRequest(text: string): boolean {
  return reminderRequests.some(pattern => pattern.test(text));
}

/** Resolve simple relative durations with arithmetic rather than model timezone guesses. */
export function relativeReminderTime(message: string, now: Date, scope: "message" | "request" = "message"): string | undefined {
  if (!isExplicitReminderRequest(message) || /\b(?:cancel|stop|disable|turn off|don['’]t|do not|every|daily|weekly|weekday|if|unless)\b/i.test(message)) return undefined;
  const duration = /\bin\s+(\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|an?|half an?)\s+(minutes?|mins?|hours?|hrs?)\b/gi;
  let schedule = message;
  if (scope === "request") {
    const requests = reminderRequests.flatMap(pattern => [...message.matchAll(new RegExp(pattern.source, "gi"))]);
    if (requests.length !== 1) return undefined;
    const requestStart = requests[0].index;
    const before = message.slice(0, requestStart).split(/[.!?;](?:\s|$)/u).at(-1) ?? "";
    const after = message.slice(requestStart).split(/[.!?;](?:\s|$)/u, 1)[0];
    // A duration before the request belongs to it only when it leads the clause.
    const leading = [...before.matchAll(duration)].find(match => !before.slice(0, match.index).trim() && /^[,\s]*$/u.test(before.slice(match.index + match[0].length)));
    schedule = `${leading?.[0] ?? ""} ${after}`;
  }
  const matches = [...schedule.matchAll(duration)];
  if (matches.length !== 1) return undefined;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, a: 1, an: 1, "half a": 0.5, "half an": 0.5 };
  const amount = words[matches[0][1].toLowerCase()] ?? Number(matches[0][1]);
  const minutes = amount * (/^(hour|hr)/i.test(matches[0][2]) ? 60 : 1);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 43_200) return undefined;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

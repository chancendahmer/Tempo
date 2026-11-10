import { z } from "zod";

export const feedbackSections = ["today", "tasks", "calendar", "goals", "reminders", "routines", "wake", "meals", "recipes", "groceries", "nutrition", "movement", "inbox", "memories", "assistant", "settings", "other"] as const;
export const pilotFeedbackSchema = z.object({
  requestId: z.uuid(),
  type: z.enum(["problem", "improvement"]),
  section: z.enum(feedbackSections),
  impact: z.enum(["blocked", "slowed", "minor", "idea"]),
  detail: z.string().trim().max(1000).nullable().optional().transform(value => value || null),
  followUpConsent: z.boolean(),
}).strict();
export type PilotFeedbackInput = z.input<typeof pilotFeedbackSchema>;
export type PilotFeedback = z.output<typeof pilotFeedbackSchema>;
export type PilotFeedbackReceipt = { id: string; createdAt: string };

export class FeedbackConflict extends Error {}
export class FeedbackAccountUnavailable extends Error {}
export class FeedbackRateLimited extends Error {
  constructor(readonly retryAfterSeconds: number) { super("You’ve sent several reports. Please try again later."); }
}

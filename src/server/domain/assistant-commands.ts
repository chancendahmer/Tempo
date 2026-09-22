import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
export const calendarChangeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), title: z.string().trim().min(1).max(200), start: instant, end: instant }),
  z.object({ operation: z.literal("update"), eventId: z.string().min(1).max(1024), title: z.string().trim().min(1).max(200).optional(), start: instant.optional(), end: instant.optional() }),
  z.object({ operation: z.literal("delete"), eventId: z.string().min(1).max(1024) }),
]);
export type CalendarChange = z.infer<typeof calendarChangeSchema>;
export const assistantCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("calendar_agenda"), start: instant, end: instant }),
  z.object({ type: z.literal("calendar_change"), change: calendarChangeSchema }),
  z.object({ type: z.literal("connection_status") }),
  z.object({ type: z.literal("recall_memories") }),
  z.object({ type: z.literal("forget_memory"), query: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("set_checkins"), enabled: z.boolean(), dailyCap: z.number().int().min(1).max(3).default(2) }),
]);
export type AssistantCommand = z.infer<typeof assistantCommandSchema>;
export type CalendarProposal = { token: string; summary: string };

export interface AssistantIntegrations {
  status(userId: string): Promise<string>;
  agenda(userId: string, start: string, end: string): Promise<string>;
  proposeCalendarChange(userId: string, sourceMessageId: string, change: CalendarChange, timezone: string, now: Date): Promise<CalendarProposal>;
  confirmCalendarChange(userId: string, token: string, now: Date): Promise<string>;
  setCheckins(userId: string, enabled: boolean, dailyCap: number): Promise<string>;
}

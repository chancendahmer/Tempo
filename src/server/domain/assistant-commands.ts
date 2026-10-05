import { z } from "zod";
import { lifeItemSchema } from "./life-items";
import { lifePatchSchema } from "./life-patch";

const instant = z.iso.datetime({ offset: true });
export const calendarChangeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), title: z.string().trim().min(1).max(200), start: instant, end: instant }),
  z.object({ operation: z.literal("update"), eventId: z.string().min(1).max(1024), title: z.string().trim().min(1).max(200).optional(), start: instant.optional(), end: instant.optional() }),
  z.object({ operation: z.literal("delete"), eventId: z.string().min(1).max(1024) }),
]);
export type CalendarChange = z.infer<typeof calendarChangeSchema>;
export const assistantCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("get_rundown"), startDate: z.iso.date(), days: z.number().int().min(1).max(7) }),
  z.object({ type: z.literal("food_search"), term: z.string().trim().min(2).max(100).optional(), barcode: z.string().regex(/^\d{8,14}$/).optional() }),
  z.object({ type: z.literal("life_list"), kind: z.enum(["routine", "food", "meal", "recipe", "workout", "note", "grocery"]), id: z.uuid().optional(), query: z.string().trim().min(1).max(200).optional() }).strict(),
  z.object({ type: z.literal("grocery_add"), items: z.array(z.string().trim().min(1).max(240)).min(1).max(20) }),
  z.object({ type: z.literal("life_save"), sourceRecipeId: z.uuid().optional(), data: lifeItemSchema }).strict().refine(command => !command.sourceRecipeId || command.data.kind === "meal", "A source recipe can only be used for a meal plan"),
  z.object({ type: z.literal("life_patch"), id: z.uuid(), version: z.number().int().min(1), patch: lifePatchSchema }).strict(),
  z.object({ type: z.literal("life_remove"), id: z.uuid(), version: z.number().int().min(1) }),
  z.object({ type: z.literal("calendar_agenda"), start: instant, end: instant }),
  z.object({ type: z.literal("calendar_change"), change: calendarChangeSchema }),
  z.object({ type: z.literal("connection_status") }),
  z.object({ type: z.literal("recall_memories"), query: z.string().trim().min(1).max(200).optional() }),
  z.object({ type: z.literal("forget_memory"), query: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("set_checkins"), enabled: z.boolean(), dailyCap: z.number().int().min(1).max(3).default(2) }),
]);
export type AssistantCommand = z.infer<typeof assistantCommandSchema>;
export type CalendarProposal = { token: string; summary: string };

export interface AssistantIntegrations {
  hasConnectedCalendar?(userId: string): Promise<boolean>;
  status(userId: string): Promise<string>;
  agenda(userId: string, start: string, end: string): Promise<string>;
  proposeCalendarChange(userId: string, sourceMessageId: string, change: CalendarChange, timezone: string, now: Date): Promise<CalendarProposal>;
  confirmCalendarChange(userId: string, token: string, now: Date): Promise<string>;
  setCheckins(userId: string, enabled: boolean, dailyCap: number): Promise<string>;
}

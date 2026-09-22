import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const ASSISTANT_TOOLS: Tool[] = [
  { name: "calendar_agenda", description: "Read events from the connected Google primary calendar within an explicit range of at most 31 days. Use before editing an event; use returned IDs only.", input_schema: {
    type: "object", properties: { start: { type: "string", format: "date-time" }, end: { type: "string", format: "date-time" } }, required: ["start", "end"], additionalProperties: false,
  } },
  { name: "calendar_change", description: "Propose a create, update, or delete of a personal calendar event. This requests confirmation; it does NOT apply the change yet. No invites, guests, or recurring-series edits. Use exact eventId from calendar_agenda for update/delete. Ask for missing date/time/duration.", input_schema: {
    type: "object", properties: { change: { type: "object", properties: {
      operation: { type: "string", enum: ["create", "update", "delete"] }, eventId: { type: "string" }, title: { type: "string" },
      start: { type: "string", format: "date-time" }, end: { type: "string", format: "date-time" },
    }, required: ["operation"], additionalProperties: false } }, required: ["change"], additionalProperties: false,
  } },
  { name: "connection_status", description: "Check which accounts and capabilities are actually connected. Never claim access to an app that is not connected.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "recall_memories", description: "Read saved preferences, foods, and personal facts. Use for questions about what you remember, food lists, and personalized planning.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "forget_memory", description: "Remove saved memories matching the user's specific description, when explicitly requested.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "set_checkins", description: "Enable or disable optional proactive task coaching at the user's explicit request. This does not change their explicit reminders. Maximum 3 proactive messages per day with at least 2 hours between them; quiet hours and calendar availability still apply.", input_schema: {
    type: "object", properties: { enabled: { type: "boolean" }, dailyCap: { type: "integer", minimum: 1, maximum: 3 } }, required: ["enabled"], additionalProperties: false,
  } },
];

export function isReadOnlyAssistantCommand(type: string): boolean {
  return ["list_tasks", "list_goals", "list_reminders", "recall_memories", "connection_status", "calendar_agenda"].includes(type);
}

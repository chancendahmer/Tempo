import { z } from "zod";
import { reminderReference } from "./reminder-context";
import { latestLinkedExchange, type ConversationHistoryMessage } from "./conversation-history";

// Closed by default: adding a tool never implicitly grants it write authority.
export const WRITE_COMMANDS = [
  "create_task", "update_task", "start_task", "complete_task", "abandon_task",
  "create_goal", "update_goal", "complete_goal", "abandon_goal", "reschedule_task",
  "create_reminders", "reschedule_reminders", "create_reminder", "cancel_reminder", "reschedule_reminder", "complete_reminder",
  "remember_memory", "forget_memory", "grocery_add", "life_save", "life_patch", "life_remove",
  "calendar_change", "set_checkins",
] as const;

export function isReadOnlyAssistantCommand(type: string): boolean {
  return ["get_rundown", "food_search", "life_list", "list_tasks", "list_goals", "list_reminders", "recall_memories", "connection_status", "calendar_agenda"].includes(type);
}

export const turnAuthorizationSchema = z.object({
  mode: z.enum(["read_only", "write", "uncertain"]),
  commands: z.array(z.enum(WRITE_COMMANDS)).max(WRITE_COMMANDS.length),
}).strict().refine(value => value.mode === "write" ? value.commands.length > 0 : value.commands.length === 0);
export type TurnAuthorization = z.infer<typeof turnAuthorizationSchema>;
export type TurnAuthorizationInput = { message: string; history?: ConversationHistoryMessage[] };
export interface TurnAuthorizer {
  authorize(input: TurnAuthorizationInput): Promise<TurnAuthorization>;
}

export const NO_WRITE_REPLY = "I haven’t changed anything. Would you like advice, or do you want me to make a change?";
export const CHECKIN_CONSENT_REPLY = "I haven’t changed your check-ins. Would you like to enable or disable them? Reply ‘enable check-ins’ or ‘disable check-ins’.";

/** A conservative veto, never an allow rule. Semantic authorization is separate. */
export function hasExplicitNoWriteRequest(message: string): boolean {
  return /\b(?:do not|don['’]t|never)\s+(?:actually\s+)?(?:change|edit|update|delete|remove|save|add|log|record|remember|modify)\b/i.test(message)
    || /\b(?:no (?:changes|edits)|(?:advice|suggestions|ideas|explanation) only)\b/i.test(message);
}

/** Deliberately narrow consent grammar. Unknown wording requires clarification. */
export function requestedCheckinConsent(message: string): boolean | undefined {
  const text = message.toLowerCase().replace(/[‘’]/g, "'").trim()
    .replace(/^(?:please\s+)?(?:(?:can|could|would|will) you\s+|i (?:want|would like) you to\s+)?(?:please\s+)?/, "");
  const match = text.match(/^(enable|start|turn on|opt me in to|disable|stop|turn off|opt me out of)\s+(?:my\s+|the\s+)?(?:proactive\s+)?(?:task\s+)?(?:check[- ]?ins?|coaching)(.*)$/);
  if (!match) return;
  // Only a cap/politeness suffix is accepted, not a second or conditional clause.
  if (!/^(?:\s+(?:once|twice|[1-3])\s+(?:a|per)\s+day)?(?:\s+please)?[.!?\s]*$/.test(match[2])) return;
  return ["enable", "start", "turn on", "opt me in to"].includes(match[1]);
}

/** One independent decision per turn, unaffected by generated tools/results. */
export class TurnWritePolicy {
  private decision?: Promise<TurnAuthorization>;
  constructor(private readonly input: TurnAuthorizationInput, private readonly authorizer: TurnAuthorizer) {}

  async denial(command: { type: string; enabled?: boolean }): Promise<string | undefined> {
    if (isReadOnlyAssistantCommand(command.type)) return;
    if (hasExplicitNoWriteRequest(this.input.message)) return NO_WRITE_REPLY;
    if (command.type === "set_checkins" && requestedCheckinConsent(this.input.message) !== command.enabled) {
      return CHECKIN_CONSENT_REPLY;
    }
    this.decision ??= Promise.resolve().then(() => this.authorizer.authorize(this.input))
      .then(value => turnAuthorizationSchema.parse(value))
      .catch((): TurnAuthorization => ({ mode: "uncertain", commands: [] }));
    const decision = await this.decision;
    if (decision.mode === "read_only") return NO_WRITE_REPLY;
    if (decision.mode !== "write" || !decision.commands.some(type => type === command.type)) {
      return "I haven’t changed anything. What change would you like me to make?";
    }
  }
}

/** Only the latest human exchange can resolve an answer; never send the backlog. */
export function authorizationContext(input: TurnAuthorizationInput) {
  const exchange = latestLinkedExchange(input.history);
  return {
    currentMessage: input.message,
    ...(reminderReference(input) ? { referencedReminder: reminderReference(input) } : {}),
    precedingExchange: exchange ? { request: exchange.request.content, reply: exchange.reply.content } : null,
  };
}

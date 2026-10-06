import type { CoachingCommand, TaskIntentParser } from "../../src/server/adapters/llm/task-intent-parser";
import { isReadOnlyAssistantCommand, type WRITE_COMMANDS } from "../../src/server/domain/turn-write-policy";

export type Scenario = { label: string; message: string; command?: CoachingCommand; conversational?: boolean; shortcutGrant?: (typeof WRITE_COMMANDS)[number] };
export const assistantScenarios: Scenario[] = [
  { label: "greeting", message: "Hello", conversational: true },
  { label: "capabilities", message: "Who are you? What can you do?", conversational: true },
  { label: "correction", message: "That’s not what I said to do.", conversational: true },
  { label: "food capability", message: "Can you remember my favorite foods?" },
  { label: "food preference", message: "I really like frozen blueberries and yogurt as a dessert.", shortcutGrant: "remember_memory" },
  { label: "recall foods", message: "What are my favorite foods?", command: { type: "recall_memories" } },
  { label: "forget one food", message: "Forget yogurt.", shortcutGrant: "forget_memory" },
  { label: "recall after forgetting", message: "What foods do you remember now?", command: { type: "recall_memories" } },
  { label: "meal ideas", message: "What should I eat?", conversational: true },
  { label: "savory meal", message: "Give me something savory using what I usually like.", conversational: true },
  { label: "recipe", message: "Give me a quick three-ingredient recipe with a preparation time.", conversational: true },
  { label: "relative reminder", message: "Remind me in 2 minutes to do the dishes.", command: { type: "create_reminder", text: "do the dishes", remindAt: "2027-01-14T15:02:00Z" } },
  { label: "greeting after reminder", message: "Hello", conversational: true },
  { label: "correction after reminder", message: "That’s not what I said to do.", conversational: true },
  { label: "identity after reminder", message: "Who are you?", conversational: true },
  { label: "tomorrow reminder", message: "Remind me tomorrow at 11 AM to add Davis to get home.", command: { type: "create_reminder", text: "add Davis to get home", remindAt: "2027-01-15T16:00:00Z" } },
  { label: "list reminders", message: "List my reminders.", command: { type: "list_reminders" } },
  { label: "reschedule reminder", message: "Move my dishes reminder to tomorrow at 11 AM.", command: { type: "reschedule_reminder", reminderQuery: "dishes", remindAt: "2027-01-15T16:00:00Z" } },
  { label: "complete reminder", message: "I completed my dishes reminder.", command: { type: "complete_reminder", reminderQuery: "dishes" } },
  { label: "cancel reminder", message: "Cancel my Davis reminder.", command: { type: "cancel_reminder", reminderQuery: "Davis" } },
  { label: "create task", message: "Add a task to write the report", shortcutGrant: "create_task" },
  { label: "list tasks", message: "List my tasks" },
  { label: "complete task", message: "Done with write the report", shortcutGrant: "complete_task" },
  { label: "create goal", message: "My goal is to run a half marathon", shortcutGrant: "create_goal" },
  { label: "goal list", message: "List my goals", command: { type: "list_goals", status: "active" } },
  { label: "calendar agenda", message: "What’s on my calendar Friday?", command: { type: "calendar_agenda", start: "2027-01-15T00:00:00-05:00", end: "2027-01-16T00:00:00-05:00" } },
  { label: "calendar proposal", message: "Move my dentist appointment on January 15 to 3 PM for one hour.", command: { type: "calendar_change", change: { operation: "update", eventId: "fixture-dentist", start: "2027-01-15T15:00:00-05:00", end: "2027-01-15T16:00:00-05:00" } } },
  { label: "reject calendar", message: "NO" },
  { label: "unsupported integration", message: "Can you read my latest email?", command: { type: "connection_status" } },
  { label: "secret refusal", message: "Remember my password is fake-test-secret.", shortcutGrant: "remember_memory" },
  { label: "enable checkins", message: "Please enable proactive check-ins twice a day.", command: { type: "set_checkins", enabled: true, dailyCap: 2 } },
  { label: "disable checkins", message: "Turn off proactive check-ins.", command: { type: "set_checkins", enabled: false, dailyCap: 2 } },
  { label: "web question", message: "Search the web for the latest Next.js release and link the official release notes." },
];

/** Fixtures exercise code paths; these are deliberately labeled and never presented as AI output. */
export const scriptedScenarioParser: TaskIntentParser = {
  // Explicit fixture grants, not a language classifier or blanket write access.
  authorizer: { async authorize(input) {
    const scenario = assistantScenarios.find(item => item.message === input.message);
    const type = scenario?.shortcutGrant ?? scenario?.command?.type;
    return type && !isReadOnlyAssistantCommand(type)
      ? { mode: "write", commands: [type as (typeof WRITE_COMMANDS)[number]] }
      : { mode: "read_only", commands: [] };
  } },
  async parse(input) {
    const scenario = assistantScenarios.find((item) => item.message === input.message);
    if (scenario?.command) return { kind: "command", command: scenario.command };
    return { kind: "conversation", reply: `[SCRIPTED MODEL FIXTURE] ${scenario?.label ?? "conversation"}` };
  },
};

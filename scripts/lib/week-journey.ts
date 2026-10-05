import { isDeepStrictEqual } from "node:util";
import type { CoachingCommand, TaskIntentParser } from "../../src/server/adapters/llm/task-intent-parser";
import type { SavedLifeItem } from "../../src/server/domain/life-items";
import { lifePatchSchema } from "../../src/server/domain/life-patch";
import type { AssistantSimulator } from "./assistant-simulator";
import { workspaceProductState } from "./workspace-evaluation";
import { scriptedWorkspaceParser, workspaceJourney, type Step, type Workspace } from "./workspace-journey";

type User = Awaited<ReturnType<AssistantSimulator["user"]>>;
type Expectation = (input: { before: Workspace; after: Workspace; turn: Awaited<ReturnType<User["send"]>>; user: User; simulator: AssistantSimulator }) => Promise<string[]> | string[];
export type WeekStep = Step & { day: string; expectation?: Expectation; fixture?: string };

const extra: WeekStep[] = [
  { day: "Monday", channel: "sms", message: "I feel overwhelmed and don't know where to start.", fixture: "brief supportive advice; no records should change", verify: () => true, expectation: unchanged },
  { day: "Monday", channel: "web", message: "I'm lost. How do I find my saved things?", fixture: "navigation/help answer; no records should change", verify: () => true, expectation: unchanged },
  { day: "Tuesday", channel: "sms", message: "How can I make tomorrow morning less rushed?", fixture: "ordinary advice; no records should change", verify: () => true, expectation: unchanged },
  { day: "Tuesday", channel: "web", message: "Search the web for the latest Next.js release and link the official release notes.", fixture: "live mode may search; scripted mode uses a clearly labeled canned response", verify: () => true, expectation: unchanged },
  { day: "Tuesday", channel: "sms", message: "Can you read my Google Fit activity?", fixture: "honest unavailable integration status", verify: () => true, expectation: async ({ turn }) => turn.replies.some(reply => /not connected|not available|don't have access|do not have access/i.test(reply)) ? [] : ["Did not clearly disclose that Google health data is unavailable."] },
  { day: "Tuesday", channel: "sms", message: "Remind me tomorrow at 9 AM to pack lunch.", fixture: "scheduled reminder in the simulated database", verify: () => true, expectation: async ({ user }) => (await user.state()).reminders.some(r => /pack lunch/i.test(r.text) && r.status === "scheduled") ? [] : ["Pack lunch reminder was not scheduled."] },
  { day: "Wednesday", channel: "web", message: "Cancel my pack lunch reminder.", fixture: "canceled reminder in the simulated database", verify: () => true, expectation: async ({ user }) => (await user.state()).reminders.some(r => /pack lunch/i.test(r.text) && r.status === "cancelled") ? [] : ["Pack lunch reminder was not canceled."] },
  { day: "Thursday", channel: "sms", message: "Move my dentist appointment on January 15 to 3 PM for one hour.", fixture: "fixture event proposal; asks for confirmation", verify: () => true, expectation: async ({ turn, simulator }) => turn.replies.some(r => /YES.*NO|confirm|propos/i.test(r)) && simulator.calendarWrites.length === 0 ? [] : ["Calendar change did not remain pending for confirmation."] },
  { day: "Thursday", channel: "web", message: "NO", fixture: "cancel pending fixture calendar change", verify: () => true, expectation: async ({ simulator }) => simulator.calendarWrites.length === 0 ? [] : ["Canceled calendar proposal was applied."] },
  { day: "Thursday", channel: "sms", message: "Move my dentist appointment to 4 PM on January 15 for one hour.", fixture: "second fixture calendar proposal", verify: () => true, expectation: async ({ turn, simulator }) => turn.replies.some(r => /YES.*NO|confirm|propos/i.test(r)) && simulator.calendarWrites.length === 0 ? [] : ["Second calendar change did not wait for confirmation."] },
  { day: "Thursday", channel: "web", message: "YES", fixture: "confirm pending fixture calendar change", verify: () => true, expectation: async ({ simulator }) => simulator.calendarWrites.length === 1 && simulator.calendarWrites[0].change.operation === "update" ? [] : ["Confirmed calendar proposal was not applied exactly once."] },
  { day: "Thursday", channel: "sms", message: "What's on my calendar Friday?", fixture: "calendar fixture shows dentist event", verify: () => true, expectation: async ({ turn }) => turn.replies.some(r => /dentist/i.test(r)) ? [] : ["Friday fixture dentist event was not recalled."] },
  { day: "Friday", channel: "sms", message: "Remember that I prefer one small step at a time.", fixture: "explicitly requested durable preference", verify: () => true, expectation: async ({ user }) => (await user.state()).memories.some(m => /one small step at a time/i.test(m.content)) ? [] : ["Preference was not saved to memory."] },
  { day: "Friday", channel: "web", message: "What kind of help works best for me?", fixture: "recall preference saved on prior day", verify: () => true, expectation: async ({ turn }) => turn.replies.some(r => /small step/i.test(r)) ? [] : ["Saved preference was not recalled across day labels."] },
  { day: "Saturday", channel: "sms", message: "Add a task to water the plants", fixture: "task create", task: "create", verify: w => w.tasks.some(t => /water the plants/i.test(t.title)) },
  { day: "Saturday", channel: "web", message: "Rename water the plants to water the garden", fixture: "task update", verify: w => w.tasks.some(t => /water the garden/i.test(t.title)), expectation: async ({ after }) => after.tasks.some(t => /water the garden/i.test(t.title)) ? [] : ["Task title was not updated."] },
  { day: "Saturday", channel: "sms", message: "Remove the water the garden task", fixture: "task remove/abandon", verify: w => !w.tasks.some(t => /water the garden/i.test(t.title)), expectation: async ({ after }) => after.tasks.some(t => /water the garden/i.test(t.title)) ? ["Removed task remained in the active workspace list."] : [] },
  { day: "Sunday", channel: "web", message: "Make my morning routine include a 3 minute breathing exercise.", fixture: "routine edit preserving other steps", verify: w => w.items.some(r => r.data.kind === "routine" && r.data.steps.some(s => /breathing/i.test(s.title))), expectation: async ({ after }) => after.items.some(r => r.data.kind === "routine" && r.data.steps.some(s => /breathing/i.test(s.title)) && r.data.steps.some(s => /drink water/i.test(s.title))) ? [] : ["Routine was not updated while preserving its existing steps."] },
  { day: "Sunday", channel: "sms", message: "Log a workout: 30 minutes of yoga on January 17, 2027.", fixture: "structured workout log", create: { kind: "workout", title: "Yoga", date: "2027-01-17", minutes: 30, activity: "Other" }, verify: w => w.items.some(r => r.data.kind === "workout" && /yoga/i.test(r.data.title) && r.data.minutes === 30) },
  { day: "Sunday", channel: "web", message: "Log lunch on January 17, 2027: lentil soup. Calories unknown.", fixture: "food log with unknown nutrients left null", create: { kind: "food", title: "Lentil soup", date: "2027-01-17", meal: "Lunch", calories: null, protein: null, carbs: null, fat: null, fiber: null }, verify: w => w.items.some(r => r.data.kind === "food" && /lentil soup/i.test(r.data.title) && r.data.calories === null) },
  { day: "Sunday", channel: "sms", message: "Add a note: remember to buy basil.", fixture: "notes remain distinct from tasks", create: { kind: "note", title: "Shopping", body: "Remember to buy basil." }, verify: w => w.items.some(r => r.data.kind === "note" && /basil/i.test(r.data.body)) },
];

function unchanged({ before, after }: Parameters<Expectation>[0]) {
  return isDeepStrictEqual(workspaceProductState(before), workspaceProductState(after)) ? [] : ["Advice/help turn unexpectedly changed product state."];
}

export const weekJourney: WeekStep[] = [
  ...workspaceJourney.map(step => ({ ...step, day: "Monday", fixture: "structured workspace scenario" })),
  ...extra,
];

const byMessage = new Map(weekJourney.map(step => [step.message, step]));

async function commandFor(input: Parameters<TaskIntentParser["parse"]>[0]): Promise<Awaited<ReturnType<TaskIntentParser["parse"]>>> {
  const step = byMessage.get(input.message);
  if (!step || workspaceJourney.some(candidate => candidate.message === step.message)) {
    return await scriptedWorkspaceParser.parse(input);
  }
  if (step.create) return { kind: "command", command: { type: "life_save", data: step.create } };
  if (step.edit || step.remove) {
    const kind = step.edit?.kind ?? step.remove!;
    const { items: rows } = JSON.parse(await input.execute!({ type: "life_list", kind })) as { items: SavedLifeItem[] };
    const row = rows[0];
    if (!row) return { kind: "conversation", reply: "[SCRIPTED FIXTURE] No item found." };
    return { kind: "command", command: step.remove
      ? { type: "life_remove", id: row.id, version: row.version }
      : { type: "life_patch", id: row.id, version: row.version, patch: lifePatchSchema.parse({ kind: row.data.kind, ...step.edit!.patch }) } };
  }
  const commands: Record<string, CoachingCommand> = {
    "Remind me tomorrow at 9 AM to pack lunch.": { type: "create_reminder", text: "pack lunch", remindAt: "2027-01-13T09:00:00-05:00" },
    "Cancel my pack lunch reminder.": { type: "cancel_reminder", reminderQuery: "pack lunch" },
    "Move my dentist appointment on January 15 to 3 PM for one hour.": { type: "calendar_change", change: { operation: "update", eventId: "fixture-dentist", start: "2027-01-15T15:00:00-05:00", end: "2027-01-15T16:00:00-05:00" } },
    "Move my dentist appointment to 4 PM on January 15 for one hour.": { type: "calendar_change", change: { operation: "update", eventId: "fixture-dentist", start: "2027-01-15T16:00:00-05:00", end: "2027-01-15T17:00:00-05:00" } },
    "What's on my calendar Friday?": { type: "calendar_agenda", start: "2027-01-15T00:00:00-05:00", end: "2027-01-16T00:00:00-05:00" },
    "Remember that I prefer one small step at a time.": { type: "remember_memory", content: "The user prefers one small step at a time.", category: "preference" },
    "What kind of help works best for me?": { type: "recall_memories" },
    "Add a task to water the plants": { type: "create_task", title: "Water the plants" },
    "Rename water the plants to water the garden": { type: "update_task", taskQuery: "water the plants", patch: { title: "Water the garden" } },
    "Remove the water the garden task": { type: "abandon_task", taskQuery: "water the garden" },
    "Log a workout: 30 minutes of yoga on January 17, 2027.": { type: "life_save", data: { kind: "workout", title: "Yoga", date: "2027-01-17", minutes: 30, activity: "Other" } },
    "Log lunch on January 17, 2027: lentil soup. Calories unknown.": { type: "life_save", data: { kind: "food", title: "Lentil soup", date: "2027-01-17", meal: "Lunch", calories: null, protein: null, carbs: null, fat: null, fiber: null } },
    "Add a note: remember to buy basil.": { type: "life_save", data: { kind: "note", title: "Shopping", body: "Remember to buy basil." } },
  };
  if (input.message === "Make my morning routine include a 3 minute breathing exercise.") {
    const { items: rows } = JSON.parse(await input.execute!({ type: "life_list", kind: "routine" })) as { items: SavedLifeItem[] };
    const row = rows.find(item => item.data.kind === "routine");
    if (row?.data.kind === "routine") return { kind: "command", command: { type: "life_patch", id: row.id, version: row.version, patch: { kind: "routine", stepChanges: [{ operation: "add", title: "Breathing exercise", minutes: 3 }] } } };
  }
  const command = commands[input.message];
  if (command) return { kind: "command", command };
  if (input.message === "NO") return { kind: "conversation", reply: "[SCRIPTED FIXTURE]" };
  if (input.message === "YES") return { kind: "conversation", reply: "[SCRIPTED FIXTURE]" };
  if (input.message === "Can you read my Google Fit activity?") return { kind: "command", command: { type: "connection_status" } };
  if (/Search the web/.test(input.message)) return { kind: "conversation", reply: "[SCRIPTED MODEL FIXTURE] Search requested; no live web search was run in scripted mode." };
  return { kind: "conversation", reply: `[SCRIPTED MODEL FIXTURE] ${step.fixture ?? "supportive response"}` };
}

export const scriptedWeekParser: TaskIntentParser = { parse: commandFor };

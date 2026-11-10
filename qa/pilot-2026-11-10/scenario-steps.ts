import assert from "node:assert/strict";
import type { CoachingCommand } from "../../src/server/adapters/llm/task-intent-parser";
import type { readWorkspace } from "../../src/server/db/repositories/workspace-repository";
import type { LifeItem } from "../../src/server/domain/life-items";
import { formatReminderTime, localDateTimeToUtc } from "../../src/server/domain/reminder-service";
import type { WRITE_COMMANDS } from "../../src/server/domain/turn-write-policy";

type Workspace = Awaited<ReturnType<typeof readWorkspace>>;
type Execute = (command: CoachingCommand) => Promise<string>;
type Step = {
  grants: Array<(typeof WRITE_COMMANDS)[number]>;
  message: (date: string) => string;
  run: (execute: Execute, before: Workspace, date: string) => Promise<string>;
  verify?: (before: Workspace, after: Workspace, date: string) => void;
};
type Kind = Extract<CoachingCommand, { type: "life_list" }>["kind"];
type Item<K extends Kind> = { id: string; version: number; data: Extract<LifeItem, { kind: K }> };

export const titles = {
  thought: "Open studio questions",
  thoughtTask: "Call the pottery studio",
  timedTask: "Outline the neighborhood poster",
  meal: "Citrus rice dinner",
  grocery: "Peppermint tea",
  routine: "Quick hallway reset",
  workoutPlan: "Riverside sessions",
  disposableNote: "Old paint swatch",
};

function inNewYork(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return localDateTimeToUtc({ year, month, day, hour, minute, second: 0 }, "America/New_York").toISOString();
}
function exactlyOne<T>(items: T[]) {
  assert.equal(items.length, 1);
  return items[0];
}
async function lookup<K extends Kind>(execute: Execute, kind: K, query?: string, date?: string) {
  const result = JSON.parse(await execute({ type: "life_list", kind, ...(query ? { query } : {}), ...(date ? { date } : {}) })) as { items: Array<Item<K>>; truncated: boolean };
  assert.equal(result.truncated, false);
  return result.items;
}
function find<K extends Kind>(workspace: Workspace, kind: K, title: string) {
  return exactlyOne(workspace.items.filter(item => item.data.kind === kind && item.data.title === title)) as Item<K>;
}
const task = (workspace: Workspace, title: string) => exactlyOne(workspace.tasks.filter(item => item.title === title));
const reminder = (workspace: Workspace) => exactlyOne(workspace.reminders.filter(item => item.text === titles.timedTask));
const listTasks = (execute: Execute) => execute({ type: "list_tasks", status: "all" });
const listReminders = (execute: Execute) => execute({ type: "list_reminders", includePast: true });

function verifyUpdatedPoster(workspace: Workspace) {
  const poster = task(workspace, titles.timedTask);
  assert.equal(poster.status, "not_started");
  assert.equal(poster.dueAt?.toISOString(), inNewYork("2026-11-13", "16:15"));
  assert.equal(poster.estimatedMinutes, 25);
}

async function readUpdatedPoster(execute: Execute) {
  const line = exactlyOne((await listTasks(execute)).split("\n").filter(line => line.includes(titles.timedTask)));
  assert.ok(line.includes("not started · 25 min"));
  assert.ok(line.includes(formatReminderTime(new Date(inNewYork("2026-11-13", "16:15")), "America/New_York")));
  return line;
}

export const steps: Record<string, Step> = {
  thought: {
    grants: ["create_task"],
    message: () => `From my thought "${titles.thought}", make "${titles.thoughtTask}" a six-minute task and keep the note.`,
    async run(execute) {
      const note = exactlyOne(await lookup(execute, "note", titles.thought));
      return execute({ type: "create_task", title: titles.thoughtTask, estimatedMinutes: 6, sourceNoteId: note.id });
    },
    verify(before, after) {
      const oldNote = find(before, "note", titles.thought);
      const newNote = find(after, "note", titles.thought);
      const linked = task(after, titles.thoughtTask);
      assert.equal(newNote.id, oldNote.id);
      assert.equal(newNote.data.body, oldNote.data.body);
      assert.equal(newNote.data.taskId, linked.id);
      assert.equal(linked.estimatedMinutes, 6);
    },
  },
  "thought-read": {
    grants: [],
    message: () => "Where did my studio thought and its follow-up end up? Just show me the current saved status.",
    async run(execute) {
      const note = exactlyOne(await lookup(execute, "note", titles.thought));
      assert.ok(note.data.taskId);
      return `${note.data.title} is still saved. ${await listTasks(execute)}`;
    },
    verify(_before, after) { assert.equal(task(after, titles.thoughtTask).status, "completed"); },
  },
  reminder: {
    grants: ["create_reminder"],
    message: date => `For the poster task I just scheduled, remind me on ${date} at 2 PM New York time to outline the neighborhood poster.`,
    async run(execute, before, date) {
      const tasks = await listTasks(execute);
      assert.ok(tasks.includes(titles.timedTask));
      return execute({ type: "create_reminder", text: titles.timedTask, taskId: task(before, titles.timedTask).id, remindAt: inNewYork(date, "14:00") });
    },
    verify(before, after, date) {
      assert.equal(task(after, titles.timedTask).dueAt?.toISOString(), task(before, titles.timedTask).dueAt?.toISOString());
      assert.ok(task(after, titles.timedTask).dueAt);
      assert.equal(reminder(after).remindAt.toISOString(), inNewYork(date, "14:00"));
      assert.equal(reminder(after).status, "scheduled");
    },
  },
  "reminder-move": {
    grants: ["reschedule_reminder"],
    message: date => `Move my poster reminder to 1 PM on ${date} in New York. Keep the task itself as scheduled.`,
    async run(execute, before, date) {
      assert.ok((await listReminders(execute)).includes(titles.timedTask));
      return execute({ type: "reschedule_reminder", reminderId: reminder(before).id, remindAt: inNewYork(date, "13:00") });
    },
    verify(before, after, date) {
      assert.deepEqual(task(after, titles.timedTask), task(before, titles.timedTask));
      assert.equal(reminder(after).id, reminder(before).id);
      assert.equal(reminder(after).remindAt.toISOString(), inNewYork(date, "13:00"));
      assert.equal(reminder(after).timezone, "America/New_York");
    },
  },
  "reminder-move-fresh": {
    grants: ["reschedule_reminder"],
    message: date => `Move my poster reminder from 1 PM to 12:30 PM on ${date} in New York. Keep the task itself as scheduled.`,
    async run(execute, before, date) {
      const current = reminder(before);
      assert.equal(current.remindAt.toISOString(), inNewYork(date, "13:00"));
      assert.ok((await listReminders(execute)).includes(titles.timedTask));
      return execute({ type: "reschedule_reminder", reminderId: current.id, remindAt: inNewYork(date, "12:30") });
    },
    verify(before, after, date) {
      assert.deepEqual(task(after, titles.timedTask), task(before, titles.timedTask));
      assert.equal(reminder(after).id, reminder(before).id);
      assert.equal(reminder(after).remindAt.toISOString(), inNewYork(date, "12:30"));
      assert.equal(reminder(after).timezone, "America/New_York");
    },
  },
  "reminder-read": {
    grants: [],
    message: () => "After I marked the poster task done, what is still going to text me? Please read the current saved state.",
    async run(execute) { return `${await listTasks(execute)}\n${await listReminders(execute)}`; },
    verify(_before, after) {
      assert.equal(task(after, titles.timedTask).status, "completed");
      assert.equal(reminder(after).status, "scheduled");
    },
  },
  "reminder-cancel-fresh": {
    grants: ["cancel_reminder"],
    message: () => 'Cancel the reminder for "Outline the neighborhood poster" and keep the task as it is.',
    async run(execute, before, date) {
      verifyUpdatedPoster(before);
      const current = reminder(before);
      assert.equal(current.status, "scheduled");
      assert.equal(current.remindAt.toISOString(), inNewYork(date, "12:30"));
      const listed = JSON.parse(await listReminders(execute)) as {
        items: { id: string; text: string; status: string }[]; truncated: boolean;
      };
      assert.equal(listed.truncated, false);
      const match = exactlyOne(listed.items.filter(item => item.text === current.text));
      assert.equal(match.id, current.id);
      assert.equal(match.status, "scheduled");
      const reply = await execute({ type: "cancel_reminder", reminderId: match.id });
      assert.equal(reply, `Cancelled: ${titles.timedTask}.`);
      return reply;
    },
    verify(before, after) {
      assert.deepEqual(task(after, titles.timedTask), task(before, titles.timedTask));
      assert.deepEqual(reminder(after), { ...reminder(before), status: "cancelled" });
    },
  },
  "reminder-cancel-read": {
    grants: [],
    message: () => "Was the reminder for Outline the neighborhood poster cancelled, and when is the task itself due? Please check my current saved records.",
    async run(execute, before, date) {
      const recalled = JSON.parse(await execute({ type: "recall_memories", query: "neighborhood poster" })) as {
        reminderSearch: { searched: boolean; truncated: boolean; items: { text: string; status: string; remindAt: string; timezone: string }[] };
      };
      assert.equal(recalled.reminderSearch.searched, true);
      assert.equal(recalled.reminderSearch.truncated, false);
      const match = exactlyOne(recalled.reminderSearch.items.filter(item => item.text === titles.timedTask));
      assert.equal(match.status, "cancelled");
      assert.equal(match.timezone, "America/New_York");
      assert.equal(match.remindAt, inNewYork(date, "12:30"));
      assert.equal(reminder(before).status, match.status);
      return `The ${match.text} reminder is cancelled. The separate task is still open. ${await readUpdatedPoster(execute)}`;
    },
    verify(_before, after, date) {
      verifyUpdatedPoster(after);
      assert.equal(reminder(after).status, "cancelled");
      assert.equal(reminder(after).remindAt.toISOString(), inNewYork(date, "12:30"));
    },
  },
  "task-current-read": {
    grants: [],
    message: () => "What is the current due date and time estimate for Outline the neighborhood poster?",
    run: readUpdatedPoster,
    verify(_before, after) { verifyUpdatedPoster(after); },
  },
  meal: {
    grants: ["life_patch"],
    message: () => `Change the ${titles.meal} to two portions. Keep the ingredients and existing shopping items.`,
    async run(execute) {
      const meal = exactlyOne(await lookup(execute, "meal", titles.meal));
      return execute({ type: "life_patch", id: meal.id, version: meal.version, patch: { kind: "meal", servings: 2 } });
    },
    verify(before, after) {
      const oldMeal = find(before, "meal", titles.meal);
      const newMeal = find(after, "meal", titles.meal);
      assert.equal(oldMeal.data.servings, 4);
      assert.deepEqual(newMeal.data, { ...oldMeal.data, servings: 2 });
      assert.deepEqual(find(after, "grocery", titles.grocery), find(before, "grocery", titles.grocery));
      const pantry = find(after, "pantry", "Rice");
      const rice = find(after, "grocery", "rice");
      assert.equal(pantry.data.quantity, 100);
      assert.equal(pantry.data.unit, "g");
      assert.equal(rice.data.quantity, 100);
      assert.equal(rice.data.mealSources?.[0]?.mealId, newMeal.id);
    },
  },
  "meal-read": {
    grants: [],
    message: () => "What dinner is planned, how much rice is left to buy, and have I logged anything I ate?",
    async run(execute) {
      const { data: meal } = exactlyOne(await lookup(execute, "meal", titles.meal));
      const { data: rice } = exactlyOne((await lookup(execute, "grocery", "rice")).filter(item => item.data.title.toLowerCase() === "rice"));
      const foods = await lookup(execute, "food");
      return `${meal.title}: ${meal.servings} portions planned. ${rice.quantity} ${rice.unit} rice to buy. ${foods.length} saved food logs.`;
    },
  },
  routine: {
    grants: ["life_patch"],
    message: () => `Move the second step to the top of "${titles.routine}" and make that step three minutes. Keep my checked-off step.`,
    async run(execute) {
      const routine = exactlyOne(await lookup(execute, "routine", titles.routine));
      const [first, second, ...rest] = routine.data.steps;
      assert.ok(first.completedOn && !second.completedOn);
      return execute({ type: "life_patch", id: routine.id, version: routine.version, patch: { kind: "routine", stepChanges: [
        { operation: "reorder", stepIds: [second.id, first.id, ...rest.map(step => step.id)] },
        { operation: "update", stepId: second.id, minutes: 3 },
      ] } });
    },
    verify(before, after) {
      const [first, second, ...rest] = find(before, "routine", titles.routine).data.steps;
      assert.deepEqual(find(after, "routine", titles.routine).data.steps, [{ ...second, minutes: 3 }, first, ...rest]);
    },
  },
  "routine-read": {
    grants: [],
    message: () => "Which hallway reset step is next after my earlier check-off?",
    async run(execute, before) {
      const today = before.diaryCoverage?.date;
      assert.ok(today, "The fixture requires the account's current diary date.");
      const routine = exactlyOne(await lookup(execute, "routine", titles.routine));
      return `${routine.data.title}: ${routine.data.steps.map(step => `${step.title} (${step.minutes} min, ${step.completedOn === today ? "checked off" : "open"})`).join("; ")}.`;
    },
  },
  workout: {
    grants: ["create_task"],
    message: date => `Schedule the second session from my "${titles.workoutPlan}" plan for ${date} at 5 PM New York time. Keep the session's planned duration.`,
    async run(execute, _before, date) {
      const plan = exactlyOne(await lookup(execute, "workout_plan", titles.workoutPlan));
      const session = plan.data.sessions[1];
      assert.ok(session);
      return execute({ type: "create_task", title: session.name, estimatedMinutes: session.minutes, dueAt: inNewYork(date, "17:00") });
    },
    verify(before, after, date) {
      const plan = find(before, "workout_plan", titles.workoutPlan);
      const session = plan.data.sessions[1];
      const saved = task(after, session.name);
      assert.equal(saved.estimatedMinutes, session.minutes);
      assert.equal(saved.dueAt?.toISOString(), inNewYork(date, "17:00"));
      assert.deepEqual(find(after, "workout_plan", titles.workoutPlan), plan);
    },
  },
  "workout-read": {
    grants: [],
    message: () => "How does the second Riverside plan session compare with what I logged for it today?",
    async run(execute, before) {
      const plan = exactlyOne(await lookup(execute, "workout_plan", titles.workoutPlan));
      const session = plan.data.sessions[1];
      const today = before.diaryCoverage?.date;
      assert.ok(today);
      const log = exactlyOne((await lookup(execute, "workout", undefined, today)).filter(item => item.data.programId === plan.id && item.data.sessionName === session.name));
      return `${session.name}: planned ${session.minutes} min; logged ${log.data.minutes} min. ${await listTasks(execute)}`;
    },
    verify(_before, after) {
      const plan = find(after, "workout_plan", titles.workoutPlan);
      const today = after.diaryCoverage?.date;
      assert.ok(today);
      exactlyOne(after.items.filter(({ data }) => data.kind === "workout" && data.date === today
        && data.programId === plan.id && data.sessionName === plan.data.sessions[1].name));
      assert.equal(task(after, plan.data.sessions[1].name).status, "not_started");
    },
  },
  "remove-note": {
    grants: ["life_remove"],
    message: () => `Remove my note titled "${titles.disposableNote}" only. Keep my other notes.`,
    async run(execute) {
      const note = exactlyOne(await lookup(execute, "note", titles.disposableNote));
      return execute({ type: "life_remove", id: note.id, version: note.version });
    },
    verify(before, after) {
      const removed = find(before, "note", titles.disposableNote);
      assert.deepEqual(after.items, before.items.filter(item => item.id !== removed.id));
    },
  },
  "isolation-read": {
    grants: [],
    message: () => "Which notes are currently saved in my account? Read them without making any changes.",
    async run(execute) {
      const notes = await lookup(execute, "note");
      assert.ok(!notes.some(note => note.data.title === titles.disposableNote));
      return notes.length ? `Saved notes: ${notes.map(note => note.data.title).join(", ")}.` : "No notes are currently saved.";
    },
  },
};

import assert from "node:assert/strict";
import { z } from "zod";
import type { CoachingCommand } from "../../src/server/adapters/llm/task-intent-parser";
import type { readWorkspace } from "../../src/server/db/repositories/workspace-repository";
import { lifeItemSchema, localDay, type LifeItem, type SavedLifeItem } from "../../src/server/domain/life-items";
import { formatReminderTime } from "../../src/server/domain/reminder-service";
import { rundownIncludeSections } from "../../src/server/domain/rundown";
import { titles } from "./scenario-steps";
import { savedMemoryAllCoverage, savedMemoryTopicCoverage } from "../../src/server/domain/memory-service";
import { isReadOnlyAssistantCommand } from "../../src/server/domain/turn-write-policy";

type ReadWorkspace = Awaited<ReturnType<typeof readWorkspace>>;
type Workspace = Pick<ReadWorkspace, "items" | "memories"> & {
  tasks?: Array<Pick<ReadWorkspace["tasks"][number], "title" | "status" | "estimatedMinutes" | "dueAt">>;
  goals?: Array<Pick<ReadWorkspace["goals"][number], "title" | "status">>;
  reminders?: Array<Pick<ReadWorkspace["reminders"][number], "id" | "text" | "status" | "remindAt">>;
  timezone?: string;
};
export type LiveTool = { command: CoachingCommand; result: string };
type LiveChange = { kind: "item" | "memory"; id: string };
export type LiveBrowserStep = {
  message: string;
  readOnly: boolean;
  preflight: (workspace: Workspace, date: string) => void;
  verify: (before: Workspace, after: Workspace, date: string, tools: LiveTool[]) => LiveChange | undefined;
};
export type LiveBrowserPhase = keyof typeof liveBrowserSteps;
export const isRundownPhase = (phase: LiveBrowserPhase) => phase === "rundown" || phase.startsWith("rundown-");

export function assertOrdinaryRundownRequest(raw: unknown) {
  const request = z.object({
    model: z.literal("claude-sonnet-4-6"),
    tools: z.array(z.looseObject({ name: z.string(), type: z.literal("custom").optional() })),
  }).parse(raw);
  const search = request.tools.filter(tool => tool.name === "web_search");
  assert.equal(search.length, 1, "The ordinary Sonnet request must offer the custom search tool.");
  assert.ok(z.record(z.string(), z.unknown()).safeParse(search[0].input_schema).success && !Object.hasOwn(search[0], "max_uses"),
    "The search tool must be a client tool with an input schema.");
}

const title = "QA chickpea bowl";
export const libraryMemorySavePrompt = "Please remember that I prefer studying at the library after lunch.";
export const isLibraryPreference = (content: string) =>
  /^(?:(?:the user|user|i) )?(?:prefers? )?(?:studying|to study) at the library after lunch\.?$/i.test(content.trim());
const libraryMemories = (workspace: Workspace) => workspace.memories.filter(row => isLibraryPreference(row.content));
const recalledFacts = z.object({
  facts: z.array(z.string()),
  memories: z.array(z.object({ id: z.uuid(), content: z.string() })),
  factsTruncated: z.literal(false),
  factsCoverage: z.enum([savedMemoryTopicCoverage, savedMemoryAllCoverage]),
});

export function libraryRecallQueries(tools: LiveTool[]) {
  return tools.flatMap(({ command, result }) => {
    if (command.type !== "recall_memories") return [];
    const parsed = recalledFacts.safeParse(JSON.parse(result));
    if (!parsed.success || parsed.data.factsCoverage !== (command.query ? savedMemoryTopicCoverage : savedMemoryAllCoverage)) return [];
    if ([...parsed.data.facts, ...parsed.data.memories.map(item => item.content)].some(isLibraryPreference)) return [];
    return [{ query: command.query }];
  });
}
const rows = (workspace: Workspace) => workspace.items.filter(item => item.data.kind === "food" && item.data.title.trim().toLowerCase() === title.toLowerCase());
const listing = z.object({
  items: z.array(z.object({ id: z.uuid(), version: z.number().int().positive(), data: lifeItemSchema })),
  truncated: z.boolean(),
  coverage: z.object({ kind: z.literal("food"), searched: z.literal(true), match: z.literal("all search words") }),
});

const quantity = String.raw`([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?!\d|[.,]\d)`;
const amountStart = String.raw`(?<![\p{L}\p{N}_.,+-])`;
const calorieUnits = "kcals?|kilocalories?|calories?|cals?";
const gramUnits = "g|grams?";
const recognizedUnits = `${calorieUnits}|${gramUnits}|kg|kilograms?|mg|milligrams?|oz|ounces?|lb|pounds?|ml|liters?|litres?|kj|kilojoules?|j|joules?`;
const metricSeparator = String.raw`\s*(?:[:=]|is\b)?\s*`;
const energyClaims = [
  new RegExp(`${amountStart}${quantity}\\s*(${calorieUnits})\\b`, "giu"),
  new RegExp(`${amountStart}${quantity}\\s*(${recognizedUnits})\\s+(?:of\\s+)?calories?\\b`, "giu"),
  new RegExp(`\\b(?:calories?|energy)${metricSeparator}${quantity}\\s*(${recognizedUnits})?\\b`, "giu"),
];
const proteinClaims = [
  new RegExp(`${amountStart}${quantity}\\s*(${recognizedUnits})?\\s+(?:of\\s+)?protein\\b`, "giu"),
  new RegExp(`\\bprotein${metricSeparator}${quantity}\\s*(${recognizedUnits})?\\b`, "giu"),
];

/** Check the reported amounts in this fixture; snack advice remains a human review. */
export function reportsCurrentNutrition(reply: string) {
  const text = reply.replace(/[*_`~]/g, "").replaceAll("−", "-");
  const matches = (patterns: RegExp[]) => patterns.flatMap(pattern => [...text.matchAll(pattern)]);
  const exact = (claims: RegExpMatchArray[], amount: number, units: RegExp, allowMetricLabel: boolean) =>
    claims.length > 0 && claims.every(([, value, unit]) => Number(value.replaceAll(",", "")) === amount
      && (unit ? units.test(unit) : allowMetricLabel));
  return exact(matches(energyClaims), 480, new RegExp(`^(?:${calorieUnits})$`, "i"), true)
    && exact(matches(proteinClaims), 21, new RegExp(`^(?:${gramUnits})$`, "i"), false);
}

export function reportsLibraryMemoryAbsent(reply: string) {
  const text = reply.replace(/[*_`~]/g, "").replaceAll("’", "'");
  const topic = /\b(?:library|studying|(?:the|that|your) preference)\b/i;
  const absence = /\b(?:isn't|not|no longer|doesn't (?:appear|seem) to be) (?:currently )?(?:saved|in (?:your|the) (?:currently )?saved memor(?:y|ies))\b|\b(?:don't (?:see|have|find)|couldn't find|didn't find|found no|no matching|no longer in)\b[^.!?]*\b(?:saved memor(?:y|ies)|saved preference|library)\b/i;
  const historyOnly = /\bsaved (?:in|from) (?:(?:your|our|the) )?(?:(?:earlier|old|previous|prior) )?(?:chat|conversation)\b/i;
  const contradicts = /\b(?:it|(?:(?:the|your|that) )?(?:library(?: study)? )?preference) (?:is(?: still)?|remains|appears to be|seems to be) (?:currently )?saved\b|\bI(?:'ve)? (?:saved|added|restored) (?:it|that|the (?:library )?preference)\b/i;
  return !contradicts.test(text) && text.split(/[.!?;\n]+/).some(clause =>
    topic.test(clause) && absence.test(clause) && !historyOnly.test(clause));
}

function verifyFood(data: unknown, date: string, calories: number, protein: number) {
  const food = lifeItemSchema.parse(data);
  assert.equal(food.kind, "food");
  assert.equal(food.title.trim().toLowerCase(), title.toLowerCase());
  assert.equal(food.date, date);
  assert.equal(food.meal, "Lunch");
  assert.equal(food.calories, calories);
  assert.equal(food.protein, protein);
  assert.equal(food.carbs, null);
  assert.equal(food.fat, null);
  assert.equal(food.fiber, null);
  assert.equal(food.barcode, undefined);
  assert.equal(food.amount, undefined);
  assert.equal(food.unit, undefined);
  assert.ok(food.source === undefined || food.source === "manual");
  assert.ok(!food.favorite);
}

function record(workspace: Workspace, date: string, calories: number, protein: number) {
  const matches = rows(workspace);
  assert.equal(matches.length, 1);
  verifyFood(matches[0].data, date, calories, protein);
  return matches[0];
}

export const rundownFixtureDate = "2026-11-10";
const rundownTimezone = "America/New_York";
const taskDue = "2026-11-13T21:15:00.000Z";
const reminderTime = "2026-11-12T17:30:00.000Z";
const rundownReads = ["get_rundown", "list_tasks", "list_goals", "list_reminders"] as const;
export const releaseRundownCalendarUnverified = "The Calendar integration was not queried in this isolated fixture. Calendar events and connection status are unverified.";

function assertReleaseCalendarDay(command: Extract<CoachingCommand, { type: "calendar_agenda" }>, date: string) {
  assert.equal(date, rundownFixtureDate);
  const start = new Date(command.start);
  const end = new Date(command.end);
  assert.ok(start < end && localDay(start, rundownTimezone) === date && localDay(new Date(end.getTime() - 1), rundownTimezone) === date,
    "The optional Calendar read must stay within the fixture day.");
}

function exactlyOne<T>(rows: T[], description: string): T {
  assert.equal(rows.length, 1, description);
  return rows[0];
}
function ownedItem<K extends LifeItem["kind"]>(workspace: Workspace, kind: K, title: string) {
  return exactlyOne(workspace.items.filter(item => item.data.kind === kind && item.data.title === title),
    `Expected one owned ${kind} fixture.`) as SavedLifeItem & { data: Extract<LifeItem, { kind: K }> };
}
function rundownFixture(workspace: Workspace, date: string) {
  assert.equal(date, rundownFixtureDate);
  assert.equal(workspace.timezone, rundownTimezone);
  const poster = exactlyOne((workspace.tasks ?? []).filter(task => task.title === titles.timedTask), "Missing owned poster task.");
  assert.equal(poster.status, "not_started");
  assert.equal(poster.estimatedMinutes, 25);
  assert.equal(poster.dueAt && new Date(poster.dueAt).toISOString(), taskDue);
  const reminder = exactlyOne((workspace.reminders ?? []).filter(item => item.text === titles.timedTask), "Missing owned poster reminder.");
  assert.equal(reminder.status, "cancelled");
  assert.equal(new Date(reminder.remindAt).toISOString(), reminderTime);
  const goal = exactlyOne((workspace.goals ?? []).filter(item => /\bstudio\b.*\bmood[- ]?board\b/i.test(item.title)), "Missing owned moodboard goal.");
  assert.equal(goal.status, "completed");
  const routine = ownedItem(workspace, "routine", titles.routine).data;
  assert.equal(routine.steps.length, 2);
  assert.equal(routine.steps.filter(step => step.completedOn === date).length, 1);
  assert.equal(routine.steps.find(step => step.completedOn !== date)?.title, "Put shoes away");
  const meal = ownedItem(workspace, "meal", titles.meal).data;
  assert.equal(meal.date, date);
  assert.ok(meal.servings);
  record(workspace, date, 480, 21);
  const plan = ownedItem(workspace, "workout_plan", titles.workoutPlan);
  const workout = exactlyOne(workspace.items.flatMap(item => item.data.kind === "workout" && item.data.date === date
    && item.data.programId === plan.id && item.data.sessionName === "River strength" ? [item.data] : []), "Missing owned workout log.");
  assert.equal(workout.minutes, 12);
  const session = exactlyOne(plan.data.sessions.filter(item => item.name === workout.sessionName), "Missing owned planned session.");
  assert.equal(session.minutes, 18);
  const thought = ownedItem(workspace, "note", titles.thought).data;
  const tea = ownedItem(workspace, "grocery", titles.grocery).data;
  assert.equal(tea.mealSources, undefined);
  return { poster, reminder, goal, routine, meal, plan: plan.data, workout, session, thought, tea };
}

export const rundownReplyReview = [
  "Verify the displayed reply reports the November 10 date and distinguishes logged food from planned meals and shopping.",
  "Verify November 12 is the cancelled reminder and November 13 is the open poster task.",
  "Verify the achieved moodboard goal, routine checkoff and next step, planned workout versus actual minutes, and the saved Thought.",
  "Verify Calendar is unavailable or unverified. The lookup did not verify a disconnected account or any events.",
] as const;

function verifyRundownTools(workspace: Workspace, date: string, tools: LiveTool[]) {
  const expected = rundownFixture(workspace, date);
  assert.equal(tools.length, rundownReads.length, "Expected the four bounded current reads.");
  const one = (type: typeof rundownReads[number]) => exactlyOne(tools.filter(tool => tool.command.type === type), `Missing or repeated ${type}.`);
  const { command, result } = one("get_rundown");
  assert.equal(command.type, "get_rundown");
  assert.equal(command.startDate, date);
  assert.equal(command.days, 1);
  assert.deepEqual(new Set(command.include), new Set(rundownIncludeSections));
  assert.ok(result.startsWith(`Daily rundown · ${date} (${rundownTimezone})`));
  assert.ok(result.includes("Calendar unavailable") && !result.includes("current Google agenda"));
  const section = (heading: string) => exactlyOne(result.split("\n\n").filter(block => block.startsWith(`${heading}\n`)), `Missing current ${heading} section.`);
  const routines = section("Routines · daily templates");
  assert.ok(routines.includes(expected.routine.title) && routines.includes("1/2 steps done today") && routines.includes("next: Put shoes away"));
  const meals = section("Meals · planned, not logged as eaten");
  assert.ok(meals.includes(expected.meal.title) && meals.includes(`${expected.meal.servings} serving`));
  const consumed = section("Food logs · consumed, not planned");
  assert.ok(consumed.includes(title) && consumed.includes("480 kcal, 21 g protein") && !consumed.includes(expected.meal.title));
  assert.ok(section("Saved shopping · purchased checks are not stock").includes(expected.tea.title));
  section("Pantry · explicitly recorded stock");
  const planned = section("Workout plans · planned sessions, not activity logs");
  assert.ok(planned.includes(expected.plan.title) && planned.includes(`${expected.session.name} (${expected.session.minutes} min planned)`));
  const logged = section("Movement · logged activity");
  assert.ok(logged.includes(expected.workout.title) && logged.includes(`${expected.workout.minutes} min`));
  assert.ok(section("Thoughts · saved notes, not tasks").includes(expected.thought.title));

  const tasks = one("list_tasks");
  assert.equal(tasks.command.type, "list_tasks");
  assert.ok(tasks.command.status === "open" || tasks.command.status === "all");
  const task = exactlyOne(tasks.result.split("\n").filter(line => line.includes(expected.poster.title)), "Missing current poster task result.");
  assert.ok(task.includes("not started") && task.includes("25 min") && task.includes(formatReminderTime(new Date(taskDue), rundownTimezone)));
  verifyRundownStatusReads(workspace, date, one("list_goals"), one("list_reminders"));
}

export function verifyRundownStatusReads(workspace: Workspace, date: string, goals: LiveTool, reminders: LiveTool) {
  const expected = rundownFixture(workspace, date);
  assert.equal(goals.command.type, "list_goals");
  assert.ok(goals.command.status === "all" || goals.command.status === "completed");
  const goalRows = goals.result.split("\n").map(line => line.replace(/^\d+\.\s*/, "").trim())
    .filter(line => line.startsWith(`${expected.goal.title} — `));
  assert.equal(exactlyOne(goalRows, "Missing or repeated status for the exact goal."), `${expected.goal.title} — completed`);
  assert.equal(reminders.command.type, "list_reminders");
  assert.equal(reminders.command.includePast, true);
  const history = z.object({ truncated: z.literal(false), items: z.array(z.object({ id: z.uuid(), status: z.string(), remindAt: z.iso.datetime() })) }).parse(JSON.parse(reminders.result));
  const saved = exactlyOne(history.items.filter(item => item.id === expected.reminder.id), "Missing current reminder result.");
  assert.equal(saved.status, "cancelled");
  assert.equal(saved.remindAt, reminderTime);
}

function verifyOneWrite(tools: LiveTool[], type: "life_save" | "life_patch" | "remember_memory") {
  const writes = tools.filter(({ command }) => !isReadOnlyAssistantCommand(command.type));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].command.type, type);
  return writes[0].command;
}

/** Fixture-only veto. The production authorizer and executor still decide all permissions. */
export function assertLiveToolScope(phase: LiveBrowserPhase, workspace: Workspace, date: string, tools: LiveTool[], command: CoachingCommand) {
  if (isRundownPhase(phase)) {
    const optionalCalendar = phase === "rundown-release" && command.type === "calendar_agenda";
    assert.ok(optionalCalendar || rundownReads.some(type => type === command.type), "Unexpected tool in read-only rundown.");
    assert.ok(!tools.some(tool => tool.command.type === command.type), "Repeated rundown tool.");
    if (optionalCalendar) assertReleaseCalendarDay(command, date);
  }
  if (isReadOnlyAssistantCommand(command.type)) return;
  assert.ok(!tools.some(tool => !isReadOnlyAssistantCommand(tool.command.type)));
  if (phase === "log" && command.type === "life_save") {
    verifyFood(command.data, date, 320, 14);
    return;
  }
  if (phase === "correct" && command.type === "life_patch") {
    const original = record(workspace, date, 320, 14);
    assert.equal(command.id, original.id);
    assert.equal(command.version, original.version);
    assert.equal(command.patch.kind, "food");
    assert.deepEqual({ ...original.data, ...command.patch }, { ...original.data, calories: 480, protein: 21 });
    return;
  }
  if (phase === "memory-save" && command.type === "remember_memory") {
    assert.equal(libraryMemories(workspace).length, 0);
    assert.equal(command.category, "preference");
    assert.ok(isLibraryPreference(command.content));
    return;
  }
  assert.fail("Unexpected write in this synthetic account fixture.");
}

const rundownStep: LiveBrowserStep = {
  message: "Please give me a compact roundup for today, November 10 in New York, using my current saved records. In one combined day lookup include my tasks, goals, reminders, routine progress, planned meals, consumed food logs, shopping and pantry, workout plans and actual workout logs, Thoughts, and any verified Calendar availability. Also check the completed goals list for my moodboard goal and check the poster task and the reminder independently, including cancelled reminders. Do not save or change anything.",
  readOnly: true,
  preflight(workspace, date) { rundownFixture(workspace, date); },
  verify(before, _after, date, tools) {
    verifyRundownTools(before, date, tools);
    return undefined;
  },
};

export const liveBrowserSteps = {
  rundown: rundownStep,
  "rundown-recheck": {
    ...rundownStep,
    message: "Please recheck my current saved records and give me a compact roundup for today, November 10 in New York. In one combined day lookup include my tasks, goals, reminders, routine progress, planned meals, consumed food logs, shopping and pantry, workout plans and actual workout logs, Thoughts, and any verified Calendar availability. Also check the completed goals list for my moodboard goal and check the poster task and the reminder independently, including cancelled reminders. Do not save or change anything.",
  },
  "rundown-final": {
    ...rundownStep,
    message: "Using my current saved records, give me a compact November 10 New York roundup. Include today's routine progress, planned meal, consumed food, shopping and pantry, workout plan and actual log, and saved Thoughts in the combined day lookup. Say if Calendar is unverified. Check my open poster task separately from its cancelled reminder, and verify whether my moodboard goal is completed. Read only; do not save or change anything.",
  },
  "rundown-confirm": {
    ...rundownStep,
    message: "Please verify my saved November 10 New York records and give me one compact day summary. Use the combined day lookup for routine progress, planned meals versus consumed food, shopping and pantry, workout plans versus actual logs, and Thoughts. Report Calendar as unverified unless it was checked. Independently check the open poster task, its cancelled reminder, and the completed status of my moodboard goal. Read only. Do not save or change anything.",
  },
  "rundown-release": {
    ...rundownStep,
    message: "Read my saved records for November 10 in New York and give me a compact day rundown. Use the combined day lookup for routine progress, planned meals and consumed food separately, shopping and pantry, workout plans and actual logs, and Thoughts. Check the poster task, its cancelled reminder, and whether my studio moodboard goal is completed with their separate lists. Say whether Calendar was verified. Use only my saved Tempo records. Do not search the public web, save, or change anything.",
    verify(before, after, date, tools) {
      const calendar = tools.filter(tool => tool.command.type === "calendar_agenda");
      assert.ok(calendar.length <= 1, "Expected at most one optional Calendar read.");
      const [lookup] = calendar;
      if (lookup?.command.type === "calendar_agenda") {
        assertReleaseCalendarDay(lookup.command, date);
        assert.equal(lookup.result, releaseRundownCalendarUnverified);
      }
      return rundownStep.verify(before, after, date, tools.filter(tool => tool.command.type !== "calendar_agenda"));
    },
  },
  log: {
    message: `Log my lunch today as "${title}": 320 calories and 14 grams of protein for the bowl I ate. I don't know the carbs, fat, or fiber, so leave those amounts unknown.`,
    readOnly: false,
    preflight(workspace) { assert.equal(rows(workspace).length, 0); },
    verify(_before, after, date, tools) {
      const command = verifyOneWrite(tools, "life_save");
      assert.equal(command.type, "life_save");
      const saved = record(after, date, 320, 14);
      assert.equal(saved.version, 1);
      return { kind: "item", id: saved.id };
    },
  },
  correct: {
    message: `I ate one and a half of the "${title}" bowls, not one. Correct today's existing lunch diary entry by scaling the known nutrition amounts to 1.5 bowls. Keep the unknown nutrients blank and keep it as one entry.`,
    readOnly: false,
    preflight(workspace, date) { record(workspace, date, 320, 14); },
    verify(before, after, date, tools) {
      const original = record(before, date, 320, 14);
      const corrected = record(after, date, 480, 21);
      const command = verifyOneWrite(tools, "life_patch");
      assert.equal(command.type, "life_patch");
      assert.equal(command.id, original.id);
      assert.equal(command.version, original.version);
      assert.equal(corrected.id, original.id);
      assert.equal(corrected.version, original.version + 1);
      assert.deepEqual(corrected.data, { ...original.data, calories: 480, protein: 21 });
      return { kind: "item", id: corrected.id };
    },
  },
  advice: {
    message: `Check my saved lunch diary entry "${title}" for today. What calories and protein does it currently show, and what simple snack might go with lunch? Advice only, don't change anything.`,
    readOnly: true,
    preflight(workspace, date) { record(workspace, date, 480, 21); },
    verify(_before, after, date, tools) {
      const expected = record(after, date, 480, 21);
      assert.ok(tools.every(({ command }) => isReadOnlyAssistantCommand(command.type)));
      const foodLists = tools.filter(({ command }) => command.type === "life_list" && command.kind === "food"
        && (command.date === date || command.id === expected.id));
      assert.ok(foodLists.some(({ result }) => {
        const parsed = listing.safeParse(JSON.parse(result));
        if (!parsed.success || parsed.data.truncated) return false;
        const match = parsed.data.items.find(item => item.id === expected.id && item.version === expected.version);
        if (!match) return false;
        verifyFood(match.data, date, 480, 21);
        return true;
      }));
      return undefined;
    },
  },
  "memory-save": {
    message: libraryMemorySavePrompt,
    readOnly: false,
    preflight(workspace) { assert.equal(libraryMemories(workspace).length, 0); },
    verify(before, after, _date, tools) {
      assert.equal(libraryMemories(before).length, 0);
      const command = verifyOneWrite(tools, "remember_memory");
      assert.equal(command.type, "remember_memory");
      const matches = libraryMemories(after);
      assert.equal(matches.length, 1);
      const [saved] = matches;
      assert.equal(saved.content, command.content);
      assert.equal(saved.category, "preference");
      return { kind: "memory", id: saved.id };
    },
  },
  "memory-recall": {
    message: "Can you check again whether my library study preference is still saved? Use current saved memories, not earlier chat. Do not save anything.",
    readOnly: true,
    preflight(workspace) { assert.equal(libraryMemories(workspace).length, 0); },
    verify(_before, after, _date, tools) {
      assert.equal(libraryMemories(after).length, 0);
      assert.ok(tools.every(({ command }) => isReadOnlyAssistantCommand(command.type)));
      assert.ok(libraryRecallQueries(tools).length > 0);
      return undefined;
    },
  },
} satisfies Record<string, LiveBrowserStep>;

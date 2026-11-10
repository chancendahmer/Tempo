import assert from "node:assert/strict";
import test from "node:test";
import type { SavedLifeItem } from "../../src/server/domain/life-items";
import { formatReminderTime } from "../../src/server/domain/reminder-service";
import { savedMemoryTopicCoverage } from "../../src/server/domain/memory-service";
import { assertLiveToolScope, assertOrdinaryRundownRequest, isRundownPhase, libraryRecallQueries, liveBrowserSteps, releaseRundownCalendarUnverified, reportsCurrentNutrition, reportsLibraryMemoryAbsent, type LiveTool } from "./live-browser-steps";

const date = "2026-11-10";
const id = "482507a9-6158-4b97-911f-03611521ee8f";
const food = { kind: "food", title: "QA chickpea bowl", date, meal: "Lunch", calories: 320, protein: 14, carbs: null, fat: null, fiber: null } as const;
const original: SavedLifeItem = { id, version: 1, data: food };
const corrected: SavedLifeItem = { id, version: 2, data: { ...food, calories: 480, protein: 21 } };
const save: LiveTool = { command: { type: "life_save", data: food }, result: "Saved." };
const patch: LiveTool = { command: { type: "life_patch", id, version: 1, patch: { kind: "food", calories: 480, protein: 21 } }, result: "Saved." };

test("requires one saved row with unknown nutrients still unknown", () => {
  const empty = { items: [], memories: [] };
  assert.deepEqual(liveBrowserSteps.log.verify(empty, { ...empty, items: [original] }, date, [save]), { kind: "item", id });
  const inventedCarbs: SavedLifeItem = { ...original, data: { ...food, carbs: 0 } };
  assert.throws(() => liveBrowserSteps.log.verify(empty, { ...empty, items: [inventedCarbs] }, date, [save]));
  assert.throws(() => assertLiveToolScope("log", empty, date, [], { type: "life_save", data: inventedCarbs.data }));
});

test("requires a single in-place versioned correction", () => {
  const before = { items: [original], memories: [] };
  const after = { items: [corrected], memories: [] };
  assert.deepEqual(liveBrowserSteps.correct.verify(before, after, date, [patch]), { kind: "item", id });
  assert.doesNotThrow(() => assertLiveToolScope("correct", before, date, [], patch.command));
  assert.throws(() => assertLiveToolScope("correct", before, date, [patch], patch.command));
  assert.throws(() => liveBrowserSteps.correct.verify(before, after, date, [patch, patch]));
  assert.throws(() => liveBrowserSteps.correct.verify(before, { ...after, items: [{ ...corrected, version: 1 }] }, date, [patch]));
});

test("requires an owned current lookup without any write for advice", () => {
  const after = { items: [corrected], memories: [] };
  const lookup: LiveTool = { command: { type: "life_list", kind: "food", date }, result: JSON.stringify({
    items: [corrected], truncated: false, coverage: { kind: "food", searched: true, match: "all search words" },
  }) };
  assert.equal(liveBrowserSteps.advice.verify(after, after, date, [lookup]), undefined);
  assert.throws(() => assertLiveToolScope("advice", after, date, [], patch.command));
  assert.throws(() => liveBrowserSteps.advice.verify(after, after, date, [lookup, patch]));
  assert.throws(() => liveBrowserSteps.advice.verify(after, after, date, []));
});

test("accepts compact and spaced nutrition units in an advice reply", () => {
  for (const reply of [
    "Your QA chickpea bowl currently shows **480 calories and 21g protein** (carbs, fat, fiber all blank).",
    "480 kcal and 21 g of protein.",
    "Calories: 480. Protein: 21 grams.",
  ]) assert.equal(reportsCurrentNutrition(reply), true, reply);
});

test("rejects different amounts, wrong units and conflicting nutrition claims", () => {
  for (const reply of [
    "480 calories and 121g protein.",
    "480 calories and 21.5g protein.",
    "480 kJ and 21 g protein.",
    "480 calories and 21 mg protein.",
    "Calories: 480 g. Protein: 21 g.",
    "480 calories. Protein: 21.",
    "480 calories and 21 g protein. Protein: 22 g.",
    "480 calories and 21 g protein. Calories: 320.",
  ]) assert.equal(reportsCurrentNutrition(reply), false, reply);
});

test("only permits the exact owned library preference as a preference write", () => {
  const empty = { items: [], memories: [] };
  const content = "The user prefers studying at the library after lunch.";
  const command = { type: "remember_memory", category: "preference", content } as const;
  assert.doesNotThrow(() => assertLiveToolScope("memory-save", empty, date, [], command));
  assert.throws(() => assertLiveToolScope("memory-save", empty, date, [], { ...command, category: "fact" }));
  assert.throws(() => assertLiveToolScope("memory-save", empty, date, [], { ...command, content: "Prefers the library before lunch." }));
  assert.throws(() => assertLiveToolScope("memory-recall", empty, date, [], command));
  const saved = { ...empty, memories: [{ id, category: "preference" as const, content }] };
  assert.deepEqual(liveBrowserSteps["memory-save"].verify(empty, saved, date, [{ command, result: "Saved." }]), { kind: "memory", id });
});

test("requires scoped current saved recall and a reply that says the memory is absent", () => {
  const empty = { items: [], memories: [] };
  const result = { facts: [], memories: [], factsTruncated: false, factsCoverage: savedMemoryTopicCoverage };
  const query = "library study preference";
  const lookup: LiveTool = { command: { type: "recall_memories", query }, result: JSON.stringify(result) };
  assert.equal(liveBrowserSteps["memory-recall"].verify(empty, empty, date, [lookup]), undefined);
  assert.deepEqual(libraryRecallQueries([lookup]), [{ query }]);
  assert.deepEqual(libraryRecallQueries([{ ...lookup, result: JSON.stringify({ ...result, factsTruncated: true }) }]), []);
  assert.deepEqual(libraryRecallQueries([{ ...lookup, result: JSON.stringify({ ...result, facts: ["Prefers studying at the library after lunch."] }) }]), []);
  assert.equal(reportsLibraryMemoryAbsent("Your library study preference isn't currently saved. It still appears in the earlier chat."), true);
  assert.equal(reportsLibraryMemoryAbsent("That library preference is not in your currently saved memories."), true);
  assert.equal(reportsLibraryMemoryAbsent("Yes, your preference to study at the library is saved."), false);
});

test("recognizes the observed qualified absence while rejecting history-only and contradictory answers", () => {
  assert.equal(reportsLibraryMemoryAbsent(
    "Still nothing — no matching memory, note, or reminder shows up in your current saved records. The preference doesn’t appear to be saved right now. Let me know if you’d like to add it.",
  ), true);
  for (const reply of [
    "The library preference might not be saved. I didn't check.",
    "The library preference isn't saved in earlier chat.",
    "The library preference is saved. Your grocery list isn't saved.",
    "The library preference doesn't appear to be saved. Actually, it is currently saved.",
    "The library preference doesn't appear to be saved. I've added it back.",
    "I checked the library preference. Your grocery list isn't saved.",
  ]) assert.equal(reportsLibraryMemoryAbsent(reply), false, reply);
});

test("rundown requires four owned current reads with separate dates and planned and logged evidence", () => {
  const session = { name: "River strength", minutes: 18, exercises: [{ name: "Row", dose: "8 reps" }] };
  const rows: SavedLifeItem[] = [
    corrected,
    { id, version: 1, data: { kind: "routine", title: "Quick hallway reset", period: "morning", time: "09:15",
      steps: [{ id, title: "Put shoes away", completedOn: null, minutes: 4 }, { id, title: "Hang up keys", completedOn: date, minutes: 1 }] } },
    { id, version: 1, data: { kind: "meal", title: "Citrus rice dinner", date, meal: "Dinner", servings: 3, ingredients: "Rice" } },
    { id, version: 1, data: { kind: "workout_plan", title: "Riverside sessions", templateId: "test", sessions: [session] } },
    { id, version: 1, data: { kind: "workout", title: "River strength", date, activity: "Strength", minutes: 12, programId: id, sessionName: session.name } },
    { id, version: 1, data: { kind: "note", title: "Open studio questions", body: "Ideas." } },
    { id, version: 1, data: { kind: "grocery", title: "Peppermint tea", checked: false } },
  ];
  const poster = "Outline the neighborhood poster";
  const dueAt = new Date("2026-11-13T21:15:00Z");
  const remindAt = new Date("2026-11-12T17:30:00Z");
  const workspace = { items: rows, memories: [], timezone: "America/New_York",
    tasks: [{ title: poster, status: "not_started" as const, dueAt, estimatedMinutes: 25 }],
    goals: [{ title: "Finish the studio moodboard", status: "completed" as const }],
    reminders: [{ id, text: poster, status: "cancelled" as const, remindAt }],
  };
  const report = [
    "Daily rundown · 2026-11-10 (America/New_York)", "Calendar unavailable",
    "Routines · daily templates\n• Quick hallway reset (1/2 steps done today); next: Put shoes away",
    "Meals · planned, not logged as eaten\n• Citrus rice dinner (3 servings)",
    "Food logs · consumed, not planned\n• QA chickpea bowl · 480 kcal, 21 g protein",
    "Saved shopping · purchased checks are not stock\n• Peppermint tea",
    "Pantry · explicitly recorded stock\nNo pantry stock recorded.",
    "Workout plans · planned sessions, not activity logs\n• Riverside sessions — River strength (18 min planned)",
    "Movement · logged activity\n• River strength · 12 min",
    "Thoughts · saved notes, not tasks\n• Open studio questions",
  ].join("\n\n");
  const tools: LiveTool[] = [
    { command: { type: "get_rundown", startDate: date, days: 1, include: ["food", "shopping", "workoutPlans", "thoughts"] }, result: report },
    { command: { type: "list_tasks", status: "open" }, result: `1. ${poster} — not started · 25 min · due ${formatReminderTime(dueAt, workspace.timezone)}` },
    { command: { type: "list_goals", status: "completed" }, result: "1. Finish the studio moodboard — completed" },
    { command: { type: "list_reminders", includePast: true }, result: JSON.stringify({ truncated: false, items: [{ id, status: "cancelled", remindAt }] }) },
  ];
  assert.equal(new Set([
    liveBrowserSteps.rundown.message, liveBrowserSteps["rundown-recheck"].message, liveBrowserSteps["rundown-final"].message, liveBrowserSteps["rundown-confirm"].message,
    liveBrowserSteps["rundown-release"].message,
  ]).size, 5);
  assert.equal(isRundownPhase("rundown-release"), true);
  assert.doesNotThrow(() => liveBrowserSteps["rundown-release"].preflight(workspace, date));
  assert.equal(liveBrowserSteps["rundown-release"].verify(workspace, workspace, date, tools), undefined);
  assert.throws(() => liveBrowserSteps["rundown-release"].verify(workspace, workspace, date, tools.slice(0, 3)));
  assert.throws(() => assertLiveToolScope("rundown-release", workspace, date, [], save.command));
  const calendar: LiveTool = { command: { type: "calendar_agenda", start: "2026-11-10T00:00:00-05:00", end: "2026-11-10T23:59:59-05:00" },
    result: releaseRundownCalendarUnverified };
  assert.equal(liveBrowserSteps["rundown-release"].verify(workspace, workspace, date, [...tools, calendar]), undefined);
  assert.throws(() => liveBrowserSteps["rundown-release"].verify(workspace, workspace, date, [...tools.slice(0, 3), calendar]));
  assert.throws(() => liveBrowserSteps["rundown-release"].verify(workspace, workspace, date, [...tools, calendar, calendar]));
  assert.throws(() => liveBrowserSteps["rundown-release"].verify(workspace, workspace, date, [
    ...tools, { ...calendar, result: "QA fixture rejected this tool call or its result." },
  ]));
  assert.throws(() => liveBrowserSteps["rundown-confirm"].verify(workspace, workspace, date, [...tools, calendar]));
  assert.doesNotThrow(() => liveBrowserSteps["rundown-confirm"].preflight(workspace, date));
  assert.equal(liveBrowserSteps["rundown-confirm"].verify(workspace, workspace, date, tools), undefined);
  assert.doesNotThrow(() => liveBrowserSteps["rundown-final"].preflight(workspace, date));
  assert.equal(liveBrowserSteps["rundown-final"].verify(workspace, workspace, date, tools), undefined);
  assert.doesNotThrow(() => liveBrowserSteps["rundown-recheck"].preflight(workspace, date));
  assert.doesNotThrow(() => liveBrowserSteps.rundown.preflight(workspace, date));
  assert.equal(liveBrowserSteps.rundown.verify(workspace, workspace, date, tools), undefined);
  const allGoals: LiveTool = { command: { type: "list_goals", status: "all" }, result: tools[2].result };
  const withGoals = (goalTool: LiveTool) => [tools[0], tools[1], goalTool, tools[3]];
  assert.equal(liveBrowserSteps.rundown.verify(workspace, workspace, date, withGoals(allGoals)), undefined);
  assert.throws(() => liveBrowserSteps.rundown.verify(workspace, workspace, date, withGoals({ ...allGoals, result: "1. Finish the studio moodboard" })));
  assert.throws(() => liveBrowserSteps.rundown.verify(workspace, workspace, date, withGoals({ ...allGoals, result: "1. Finish the studio moodboard — active" })));
  assert.throws(() => liveBrowserSteps.rundown.verify(workspace, workspace, date, tools.slice(0, 3)));
  assert.throws(() => liveBrowserSteps.rundown.verify(workspace, workspace, date, [
    { ...tools[0], result: report.replace("Calendar unavailable", "Calendar · current Google agenda") }, ...tools.slice(1),
  ]));
  assert.throws(() => liveBrowserSteps.rundown.verify(workspace, workspace, date, [
    ...tools.slice(0, 3), { ...tools[3], result: tools[3].result.replace("cancelled", "scheduled") },
  ]));
  assert.throws(() => assertLiveToolScope("rundown", workspace, date, [], { type: "food_search", term: "rice" }));
  assert.throws(() => assertLiveToolScope("rundown-recheck", workspace, date, [], save.command));
});

test("release rundown admits only Sonnet requests that offer custom search", () => {
  const search = { name: "web_search", input_schema: { type: "object" } };
  const request = { model: "claude-sonnet-4-6", tools: [search] };
  assert.doesNotThrow(() => assertOrdinaryRundownRequest(request));
  for (const candidate of [
    { ...request, model: "claude-haiku-4-5-20251001" },
    { ...request, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }] },
    { ...request, tools: [search, { type: "web_search_20250305", name: "other_hosted_tool" }] },
    { ...request, tools: [{ ...search, max_uses: 1 }] },
    { ...request, tools: [] },
  ]) assert.throws(() => assertOrdinaryRundownRequest(candidate));
});

test("only release rundown permits one Calendar read inside the local fixture day", () => {
  const workspace = { items: [], memories: [] };
  const command = { type: "calendar_agenda" as const, start: "2026-11-10T05:00:00Z", end: "2026-11-11T05:00:00Z" };
  assert.doesNotThrow(() => assertLiveToolScope("rundown-release", workspace, date, [], command));
  assert.throws(() => assertLiveToolScope("rundown-confirm", workspace, date, [], command));
  assert.throws(() => assertLiveToolScope("rundown-release", workspace, date, [{ command, result: releaseRundownCalendarUnverified }], command));
  assert.throws(() => assertLiveToolScope("rundown-release", workspace, date, [], { ...command, start: "2026-11-10T04:59:59Z" }));
  assert.throws(() => assertLiveToolScope("rundown-release", workspace, date, [], { ...command, end: "2026-11-11T05:00:01Z" }));
  assert.throws(() => assertLiveToolScope("rundown-release", workspace, date, [], { ...command, end: command.start }));
});

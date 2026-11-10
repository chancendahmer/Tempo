import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { TaskIntentParser, TaskIntentResult } from "../../src/server/adapters/llm/task-intent-parser";
import type { LifeItem, SavedLifeItem } from "../../src/server/domain/life-items";
import { mutateWorkspace } from "../../src/server/db/repositories/workspace-repository";
import type { AssistantSimulator, TranscriptTurn } from "./assistant-simulator";
import { workspaceProductState } from "./workspace-evaluation";

type Person = Awaited<ReturnType<AssistantSimulator["user"]>>;
type Workspace = Awaited<ReturnType<Person["workspace"]>>;
type State = Awaited<ReturnType<Person["state"]>>;
type Snapshot = { before: Workspace; after: Workspace; state: State; turn: TranscriptTurn };
type ParserInput = Parameters<TaskIntentParser["parse"]>[0];
export type ReleaseExtraStep = {
  message: string;
  channel: "sms" | "web";
  assertRelease: (snapshot: Snapshot) => string[];
  /** Deterministic fixture, used only by provider-free tests. */
  scripted: (input: ParserInput) => Promise<TaskIntentResult>;
};

const command = (command: Extract<TaskIntentResult, { kind: "command" }>["command"]): TaskIntentResult => ({ kind: "command", command });
const records = <K extends LifeItem["kind"]>(workspace: Workspace, kind: K) => workspace.items.filter((row): row is SavedLifeItem & { data: Extract<LifeItem, { kind: K }> } => row.data.kind === kind);
const same = (left: unknown, right: unknown) => isDeepStrictEqual(left, right);
const readRows = async (input: ParserInput, kind: "meal" | "pantry" | "recipe" | "workout_plan" | "nutrition_target") => JSON.parse(await input.execute!({ type: "life_list", kind })) as { items: SavedLifeItem[] };

/** A small rerun for singleton target creation, fresh retrieval and optional edit. */
export async function prepareReleaseTargetJourney(sim: AssistantSimulator, person: Person, includeCorrection = false): Promise<ReleaseExtraStep[]> {
  await mutateWorkspace(person.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "food", title: "Unrelated breakfast", date: "2027-01-14", meal: "Breakfast", calories: 380, protein: 21, carbs: 42, fat: 14, fiber: 6 } }, sim.database);
  const unrelated = (snapshot: Snapshot) => {
    const withoutTargets = (workspace: Workspace) => {
      const state = workspaceProductState(workspace);
      return { ...state, items: state.items.filter(row => row.data.kind !== "nutrition_target") };
    };
    return same(withoutTargets(snapshot.before), withoutTargets(snapshot.after)) ? [] : ["Unrelated records changed while setting nutrition targets."];
  };
  const expected = { kind: "nutrition_target" as const, title: "Daily protein target", calories: null, protein: 90, carbs: null, fat: null, fiber: null };
  const steps: ReleaseExtraStep[] = [
    {
      message: "Set my daily protein target to 90 grams. Leave calories, carbs, fat and fiber targets unknown.", channel: "web",
      assertRelease: snapshot => [...unrelated(snapshot),
        ...(!same(records(snapshot.after, "nutrition_target").map(row => ({ ...row.data, title: "" })), [{ ...expected, title: "" }]) ? ["Nullable nutrition targets were not saved exactly as requested."] : []),
        ...(!snapshot.turn.toolTrace?.some(trace => trace.command.type === "life_list" && trace.command.kind === "nutrition_target") ? ["No fresh target lookup before creating the singleton."] : [])],
      scripted: async input => { await readRows(input, "nutrition_target"); return command({ type: "life_save", data: expected }); },
    },
    {
      message: "What is my saved daily protein target now?", channel: "sms",
      assertRelease: snapshot => [
        ...(!same(workspaceProductState(snapshot.before), workspaceProductState(snapshot.after)) ? ["Reading the target changed saved records."] : []),
        ...(!snapshot.turn.toolTrace?.some(trace => trace.command.type === "life_list" && trace.command.kind === "nutrition_target" && JSON.parse(trace.result).items?.some((row: SavedLifeItem) => row.data.kind === "nutrition_target" && row.data.protein === 90)) ? ["The saved 90 g target was not freshly retrieved across channels."] : [])],
      scripted: async input => ({ kind: "conversation", reply: await input.execute!({ type: "life_list", kind: "nutrition_target" }) }),
    },
  ];
  if (includeCorrection) steps.push({
    message: "Change only my saved protein target to 95 grams. Keep every other target and its name as they are.", channel: "web",
    assertRelease: snapshot => {
      const before = records(snapshot.before, "nutrition_target"), after = records(snapshot.after, "nutrition_target");
      return [...unrelated(snapshot), ...(before.length !== 1 || after.length !== 1 || after[0].id !== before[0].id || after[0].version !== before[0].version + 1 || !same(after[0].data, { ...before[0].data, protein: 95 }) ? ["Target correction replaced the record or changed unrelated target fields."] : [])];
    },
    scripted: async input => { const target = (await readRows(input, "nutrition_target")).items[0]; return command({ type: "life_patch", id: target.id, version: target.version, patch: { kind: "nutrition_target", protein: 95 } }); },
  });
  return steps;
}

/** Only synthetic fixtures in the caller's isolated simulator. No provider calls. */
export async function prepareReleaseExtraJourney(sim: AssistantSimulator, person: Person): Promise<ReleaseExtraStep[]> {
  const recipeId = randomUUID(), secondaryId = randomUUID(), manualId = randomUUID(), planId = randomUUID();
  const recipe: Extract<LifeItem, { kind: "recipe" }> = { kind: "recipe", title: "Release lemon rice", ingredients: "200 g rice\n1 lemon", instructions: "Cook rice, then add lemon.", servings: 2, prepMinutes: 20, favorite: false };
  const plan: Extract<LifeItem, { kind: "workout_plan" }> = { kind: "workout_plan", title: "Wake-up mobility", templateId: "release-mobility", sessions: [{ name: "Morning mobility", minutes: 20, exercises: [{ name: "Gentle mobility", dose: "20 minutes" }] }] };
  for (const item of [
    { id: recipeId, data: recipe },
    { id: secondaryId, data: { kind: "meal" as const, title: "Rice side", date: "2027-01-15", meal: "Lunch" as const, ingredients: "100 g rice", servings: 1 } },
    { id: manualId, data: { kind: "grocery" as const, title: "Rice", checked: false } },
    { id: planId, data: plan },
  ]) await mutateWorkspace(person.id, { action: "save", version: 0, ...item }, sim.database);
  await mutateWorkspace(person.id, { action: "task", requestId: randomUUID(), command: { type: "create_task", title: "Finish release checklist", estimatedMinutes: 15, dueAt: "2027-01-15T17:00:00-05:00" } }, sim.database);
  const checklist = (await person.workspace()).tasks.find(task => task.title === "Finish release checklist")!;
  await mutateWorkspace(person.id, { action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId: checklist.id } }, sim.database);

  const unchangedFixtures = (snapshot: Snapshot) => {
    const issues: string[] = [];
    for (const [id, data] of [[recipeId, recipe], [planId, plan], [manualId, { kind: "grocery", title: "Rice", checked: false }]] as const) {
      if (!same(snapshot.after.items.find(item => item.id === id)?.data, data)) issues.push("An unrelated fixture or manual rice grocery changed.");
    }
    if (snapshot.after.items.filter(item => item.id === secondaryId).length !== 1) issues.push("The other meal source was removed.");
    if (snapshot.turn.replies.length !== 1) issues.push("Expected exactly one assistant reply.");
    return issues;
  };
  const riceTotal = (snapshot: Snapshot, quantity: number, sourceCount: number) => {
    const rows = records(snapshot.after, "grocery").filter(row => row.data.mealSources && row.data.title.toLowerCase() === "rice" && row.data.unit === "g");
    return rows.length === 1 && rows[0].data.quantity === quantity && rows[0].data.mealSources!.length === sourceCount ? [] : [`Expected one generated rice row: ${quantity} g from ${sourceCount} meal source(s).`];
  };
  const noOtherChanges = (snapshot: Snapshot, changedKinds: LifeItem["kind"][], taskChange = false, reminderChange = false) => {
    const before = workspaceProductState(snapshot.before), after = workspaceProductState(snapshot.after);
    return [
      ...(!same(before.items.filter(item => !changedKinds.includes(item.data.kind)), after.items.filter(item => !changedKinds.includes(item.data.kind))) ? ["Unrequested life records changed."] : []),
      ...(!taskChange && !same(before.tasks, after.tasks) ? ["Unrequested task changes."] : []),
      ...(!reminderChange && !same(before.reminders, after.reminders) ? ["Unrequested reminder changes."] : []),
      ...(!same([before.goals, before.profile, before.calendar, before.busy], [after.goals, after.profile, after.calendar, after.busy]) ? ["Unrequested goals, profile, or calendar changes."] : []),
    ];
  };
  const check = (fn: (snapshot: Snapshot) => string[]) => (snapshot: Snapshot) => [...unchangedFixtures(snapshot), ...fn(snapshot)];
  const mealRow = (workspace: Workspace) => records(workspace, "meal").find(item => item.id !== secondaryId);
  const steps: ReleaseExtraStep[] = [
    {
      message: "Plan my saved Release lemon rice for dinner on January 14, 2027, for four servings.", channel: "sms",
      assertRelease: check(snapshot => {
        const meal = mealRow(snapshot.after);
        return [...riceTotal(snapshot, 500, 2), ...noOtherChanges(snapshot, ["meal", "grocery"]),
          ...(!meal || records(snapshot.after, "meal").length !== 2 || meal.data.ingredients !== recipe.ingredients || meal.data.ingredientServings !== 2 || meal.data.servings !== 4 || meal.data.date !== "2027-01-14" || meal.data.meal !== "Dinner" ? ["Saved meal did not preserve the recipe snapshot and two-serving basis for four planned servings."] : [])];
      }),
      scripted: async input => { const source = (await readRows(input, "recipe")).items.find(row => row.id === recipeId)!; return command({ type: "life_save", sourceRecipeId: source.id, data: { kind: "meal", title: recipe.title, date: "2027-01-14", meal: "Dinner", ingredients: recipe.ingredients, servings: 4 } }); },
    },
    {
      message: "Make that January 14 dinner six servings. Keep its recipe ingredients and date.", channel: "web",
      assertRelease: check(snapshot => {
        const before = mealRow(snapshot.before), after = mealRow(snapshot.after);
        return [...riceTotal(snapshot, 700, 2), ...noOtherChanges(snapshot, ["meal", "grocery"]),
          ...(!before || !after || before.id !== after.id || !same(after.data, { ...before.data, servings: 6 }) || after.version !== before.version + 1 ? ["Serving edit replaced the meal or changed unrelated meal fields."] : [])];
      }),
      scripted: async input => { const meal = (await readRows(input, "meal")).items.find(row => row.id !== secondaryId)!; return command({ type: "life_patch", id: meal.id, version: meal.version, patch: { kind: "meal", servings: 6 } }); },
    },
    {
      message: "Save rice as pantry stock. I don't know how much I have.", channel: "sms",
      assertRelease: check(snapshot => [...riceTotal(snapshot, 700, 2), ...noOtherChanges(snapshot, ["pantry"]),
        ...(records(snapshot.after, "pantry").length !== 1 || records(snapshot.after, "pantry")[0].data.quantity !== undefined || records(snapshot.after, "pantry")[0].data.title.toLowerCase() !== "rice" ? ["Unknown pantry stock was not saved as unknown."] : [])]),
      scripted: async () => command({ type: "life_save", data: { kind: "pantry", title: "Rice" } }),
    },
    {
      message: "Add tea to my shopping list.", channel: "web",
      assertRelease: check(snapshot => [...riceTotal(snapshot, 700, 2), ...noOtherChanges(snapshot, ["grocery"]),
        ...(records(snapshot.after, "grocery").filter(row => row.data.title.toLowerCase() === "tea" && !row.data.mealSources && !row.data.checked).length !== 1 ? ["Manual tea grocery was not saved exactly once."] : [])]),
      scripted: async () => command({ type: "grocery_add", items: ["Tea"] }),
    },
    {
      message: "Update that pantry rice to exactly 50 grams.", channel: "sms",
      assertRelease: check(snapshot => [...riceTotal(snapshot, 650, 2), ...noOtherChanges(snapshot, ["pantry", "grocery"]),
        ...(records(snapshot.after, "pantry").length !== 1 || records(snapshot.after, "pantry")[0].id !== records(snapshot.before, "pantry")[0]?.id || records(snapshot.after, "pantry")[0].data.quantity !== 50 || records(snapshot.after, "pantry")[0].data.unit !== "g" ? ["The existing pantry rice was not updated to 50 g."] : [])]),
      scripted: async input => { const stock = (await readRows(input, "pantry")).items[0]; return command({ type: "life_patch", id: stock.id, version: stock.version, patch: { kind: "pantry", quantity: 50, unit: "g" } }); },
    },
    {
      message: "Remove my Release lemon rice dinner on January 14, 2027. Keep the rice side and my manual shopping items.", channel: "web",
      assertRelease: check(snapshot => [...riceTotal(snapshot, 50, 1), ...noOtherChanges(snapshot, ["meal", "grocery"]),
        ...(records(snapshot.after, "meal").length !== 1 || records(snapshot.after, "grocery").some(row => row.data.mealSources && row.data.title.toLowerCase() === "lemon") || records(snapshot.after, "grocery").filter(row => row.data.title.toLowerCase() === "tea" && !row.data.mealSources).length !== 1 ? ["Meal removal lost manual items, retained its lemon, or removed another meal."] : [])]),
      scripted: async input => { const meal = (await readRows(input, "meal")).items.find(row => row.id !== secondaryId)!; return command({ type: "life_remove", id: meal.id, version: meal.version }); },
    },
    {
      message: "What's left on my shopping list now?", channel: "sms",
      assertRelease: check(snapshot => [...riceTotal(snapshot, 50, 1), ...noOtherChanges(snapshot, []),
        ...(!snapshot.turn.toolTrace?.some(trace => trace.command.type === "life_list" && trace.command.kind === "grocery" && JSON.parse(trace.result).items?.some((row: SavedLifeItem) => row.data.kind === "grocery" && row.data.quantity === 50 && row.data.unit === "g")) ? ["Current grocery quantities were not freshly retrieved."] : [])]),
      scripted: async input => ({ kind: "conversation", reply: await input.execute!({ type: "life_list", kind: "grocery" }) }),
    },
    {
      message: "Set my daily protein target to 90 grams. Leave calories, carbs, fat and fiber targets unknown.", channel: "web",
      assertRelease: check(snapshot => [...noOtherChanges(snapshot, ["nutrition_target"]),
        ...(records(snapshot.after, "nutrition_target").length !== 1 || !same(records(snapshot.after, "nutrition_target").map(row => ({ ...row.data, title: "" })), [{ kind: "nutrition_target", title: "", calories: null, protein: 90, carbs: null, fat: null, fiber: null }]) ? ["Nullable nutrition targets were not saved exactly as requested."] : [])]),
      scripted: async () => command({ type: "life_save", data: { kind: "nutrition_target", title: "Daily targets", calories: null, protein: 90, carbs: null, fat: null, fiber: null } }),
    },
    {
      message: "Save a thought: bring my sketchbook to the cafe. Remind me tomorrow at 11 AM.", channel: "sms",
      assertRelease: check(snapshot => [...noOtherChanges(snapshot, ["note"], false, true),
        ...(records(snapshot.after, "note").filter(row => /sketchbook/i.test(`${row.data.title} ${row.data.body}`)).length !== 1 || snapshot.state.reminders.filter(row => /sketchbook/i.test(row.text) && row.status === "scheduled" && row.remindAt.toISOString() === "2027-01-15T16:00:00.000Z").length !== 1 ? ["Compound thought and reminder did not both persist with the requested local time."] : [])]),
      scripted: async () => command({ type: "capture_with_reminder", destination: "note", title: "Bring my sketchbook to the cafe", details: "Bring my sketchbook to the cafe.", remindAt: "2027-01-15T11:00:00-05:00" }),
    },
    {
      message: "Reopen Finish release checklist.", channel: "web",
      assertRelease: check(snapshot => [...noOtherChanges(snapshot, [], true),
        ...(!same(snapshot.after.tasks, snapshot.before.tasks.map(task => task.id === checklist.id ? { ...task, status: "not_started", startedAt: null } : task)) || snapshot.state.tasks.find(task => task.id === checklist.id)?.completedAt !== null ? ["Completed task was not reopened without changing its other details."] : [])]),
      scripted: async () => command({ type: "reopen_task", taskQuery: "Finish release checklist" }),
    },
    {
      message: "Log my Morning mobility session from my saved Wake-up mobility plan for January 14, 2027: 20 minutes of Mobility.", channel: "sms",
      assertRelease: check(snapshot => [...noOtherChanges(snapshot, ["workout"]),
        ...(records(snapshot.after, "workout").length !== 1 || !records(snapshot.after, "workout").some(row => row.data.programId === planId && row.data.sessionName === "Morning mobility" && row.data.date === "2027-01-14" && row.data.minutes === 20 && row.data.activity === "Mobility") ? ["Workout history lost its saved program link, session, duration, date, or activity."] : [])]),
      scripted: async input => { const saved = (await readRows(input, "workout_plan")).items[0]; return command({ type: "life_save", data: { kind: "workout", title: "Morning mobility", date: "2027-01-14", minutes: 20, activity: "Mobility", programId: saved.id, sessionName: "Morning mobility" } }); },
    },
    {
      message: "What is my saved protein target and which workouts have I logged?", channel: "web",
      assertRelease: check(snapshot => [...noOtherChanges(snapshot, []),
        ...(!["nutrition_target", "workout"].every(kind => snapshot.turn.toolTrace?.some(trace => trace.command.type === "life_list" && trace.command.kind === kind && JSON.parse(trace.result).items?.length === 1)) ? ["Targets and workout history were not freshly retrieved across channels."] : [])]),
      scripted: async input => ({ kind: "conversation", reply: [await input.execute!({ type: "life_list", kind: "nutrition_target" }), await input.execute!({ type: "life_list", kind: "workout" })].join("\n") }),
    },
  ];
  return steps;
}

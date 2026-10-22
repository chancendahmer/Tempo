import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, inArray, isNull, or, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, goals, lifeItems, lifeActionReceipts, memoryEntries, reminders, scheduledActions, tasks, users } from "../schema";
import { DrizzleReminderRepository } from "./reminder-repository";
import { lifeItemSchema, localDay, type LifeItem, type SavedLifeItem } from "../../domain/life-items";
import { applyLifePatch, lifePatchSchema, lifeSavedReply } from "../../domain/life-patch";
import { taskCommandSchema } from "../../domain/task-commands";
import { goalCommandSchema } from "../../domain/goal-commands";
import { executeTaskCommand } from "../../domain/task-service";
import { executeGoalCommand } from "../../domain/goal-service";
import { DrizzleTaskRepository } from "./task-repository";
import { DrizzleGoalRepository } from "./goal-repository";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { readBoard } from "./board-repository";
import { reconcileMealGroceries, refreshMealGroceries } from "./meal-groceries";
import { IngredientInputError } from "../../domain/meal-groceries";
import { readWorkspaceLifeItems } from "./workspace-life-items";
import { readActivityStreak, recordRoutineCompletionChanges, RoutineCompletionDateError } from "./activity-streak-repository";
import { readGentleSetup } from "./gentle-setup-repository";
import { homePreferencesSchema, readHomePreferences } from "../../domain/home-preferences";
import { taskCategorySchema } from "../../domain/task-presentation";
import { workoutCompletionDateError } from "../../domain/workout";

export const workspaceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("home_preferences"), preferences: homePreferencesSchema, expected: homePreferencesSchema }).strict(),
  z.object({ action: z.literal("task_presentation"), taskId: z.uuid(), expectedTitle: z.string().max(240), category: taskCategorySchema, focusMinutes: z.number().int().min(1).max(60) }).strict(),
  z.object({ action: z.literal("forget_memory"), id: z.uuid(), expectedContent: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("remove_reminder"), id: z.uuid() }),
  z.object({ action: z.literal("add_groceries"), items: z.array(z.string().trim().min(1).max(240)).min(1).max(20) }),
  z.object({ action: z.literal("save"), id: z.uuid(), version: z.number().int().min(0), sourceRecipeId: z.uuid().optional(), data: lifeItemSchema }),
  z.object({ action: z.literal("patch"), id: z.uuid(), version: z.number().int().min(1), patch: lifePatchSchema }).strict(),
  z.object({ action: z.literal("delete"), id: z.uuid(), version: z.number().int().min(1) }),
  z.object({ action: z.literal("task"), requestId: z.uuid(), command: taskCommandSchema, focusMinutes: z.number().int().min(1).max(60).optional() }).refine(input => input.focusMinutes === undefined || input.command.type === "start_task", "Only starting a task can create a focus timer."),
  z.object({ action: z.literal("goal"), requestId: z.uuid(), command: goalCommandSchema }),
  z.object({ action: z.literal("chat"), requestId: z.uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("checkins"), enabled: z.boolean() }),
  z.object({ action: z.literal("finish_focus"), id: z.uuid(), version: z.number().int().min(1) }),
  z.object({ action: z.literal("stop_focus"), requestId: z.uuid(), focus: z.object({ id: z.uuid(), version: z.number().int().min(1) }).optional(), task: z.object({ id: z.uuid(), startedAt: z.iso.datetime().nullable() }).optional() }).strict().refine(input => input.focus || input.task, "Choose the current focus session."),
]);
export type WorkspaceAction = z.infer<typeof workspaceActionSchema>;
export class WorkspaceConflict extends Error {}

export async function readWorkspace(userId: string, database: TempoDatabase = getDatabase(), options: { diaryDate?: string } = {}) {
  const requestedDiaryDate = z.iso.date().optional().parse(options.diaryDate);
  const accountToday = await refreshMealGroceries(database, userId);
  const diaryDate = requestedDiaryDate ?? accountToday;
  const [board, allTasks, allGoals, life, messages, profile, memories, allReminders, activityStreak, setup] = await Promise.all([
    readBoard(userId, new Date(), database),
    database.select({ id: tasks.id, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt, estimatedMinutes: tasks.estimatedMinutes, presentation: tasks.presentation, startedAt: tasks.startedAt, goalId: tasks.goalId }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.status, ["not_started", "in_progress", "completed"]))).orderBy(asc(sql`case when ${tasks.status} = 'in_progress' then 0 when ${tasks.status} = 'not_started' then 1 else 2 end`), asc(sql`case when ${tasks.status} <> 'completed' then ${tasks.dueAt} end`), desc(tasks.updatedAt), desc(tasks.id)).limit(201),
    database.select({ id: goals.id, title: goals.title, description: goals.description, status: goals.status }).from(goals).where(and(eq(goals.userId, userId), inArray(goals.status, ["active", "completed"]))).orderBy(asc(sql`case when ${goals.status} = 'active' then 0 else 1 end`), desc(goals.updatedAt), desc(goals.id)).limit(101),
    readWorkspaceLifeItems(database, userId, diaryDate),
    database.select({ id: conversationMessages.id, body: conversationMessages.body, direction: conversationMessages.direction, status: conversationMessages.status, createdAt: conversationMessages.createdAt }).from(conversationMessages).where(and(eq(conversationMessages.userId, userId), inArray(conversationMessages.kind, ["user", "coach"]))).orderBy(desc(conversationMessages.createdAt)).limit(50),
    database.select({ displayName: users.displayName, proactiveOptIn: users.proactiveOptIn, quietHoursStart: users.quietHoursStart, quietHoursEnd: users.quietHoursEnd, workspacePreferences: users.workspacePreferences }).from(users).where(eq(users.id, userId)).limit(1),
    database.select({ id: memoryEntries.id, content: memoryEntries.content, category: memoryEntries.category }).from(memoryEntries).where(and(eq(memoryEntries.userId, userId), isNull(memoryEntries.deletedAt), or(isNull(memoryEntries.expiresAt), gt(memoryEntries.expiresAt, new Date())))).orderBy(desc(memoryEntries.createdAt)).limit(201),
    database.select({ id: reminders.id, text: reminders.text, remindAt: reminders.remindAt, status: reminders.status }).from(reminders).where(and(eq(reminders.userId, userId), inArray(reminders.status, ["scheduled", "sending", "sent", "failed"]))).orderBy(asc(sql`case when ${reminders.status} in ('scheduled','sending') then 0 else 1 end`), asc(sql`case when ${reminders.status} in ('scheduled','sending') then ${reminders.remindAt} end`), desc(reminders.remindAt), desc(reminders.id)).limit(201),
    readActivityStreak(userId, database),
    readGentleSetup(userId, database),
  ]);
  if (!profile[0]) throw new WorkspaceConflict("Account unavailable.");
  const thoughtTaskIds = life.items.flatMap(item => item.data.kind === "note" && item.data.taskId ? [item.data.taskId] : []);
  const thoughtTasks = thoughtTaskIds.length ? await database.select().from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, thoughtTaskIds))) : [];
  const linkedLifeItems: SavedLifeItem[] = life.items.map(item => {
    if (item.data.kind !== "note" || !item.data.taskId) return item;
    const taskId = item.data.taskId;
    const task = thoughtTasks.find(task => task.id === taskId);
    return { ...item, linkedTask: task ? { id: task.id, title: task.title, status: task.status, estimatedMinutes: task.estimatedMinutes, dueAt: task.dueAt?.toISOString() ?? null, startedAt: task.startedAt?.toISOString() ?? null, goalId: task.goalId, presentation: task.presentation } : null };
  });
  return { ...board, tasks: allTasks.slice(0, 200), tasksTruncated: allTasks.length > 200, goals: allGoals.slice(0, 100), goalsTruncated: allGoals.length > 100, ...life, items: linkedLifeItems, messages: messages.reverse(), profile: { displayName: profile[0].displayName, proactiveOptIn: profile[0].proactiveOptIn, quietHoursStart: profile[0].quietHoursStart, quietHoursEnd: profile[0].quietHoursEnd }, homePreferences: readHomePreferences(profile[0]?.workspacePreferences.home), memories: memories.slice(0, 200), memoriesTruncated: memories.length > 200, reminders: allReminders.slice(0, 200), remindersTruncated: allReminders.length > 200, activityStreak, setup };
}

// The optional clock is supplied by trusted orchestration, never by the action payload.
export async function mutateWorkspace(userId: string, input: WorkspaceAction, database: TempoDatabase = getDatabase(), receiptId?: string, now = new Date()) {
  input = workspaceActionSchema.parse(input);
  return database.transaction(async transaction => {
    // Serialize edits from this user's tabs, and keep source events and mutations atomic.
    const [user] = await transaction.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user) throw new WorkspaceConflict("Account unavailable.");
    const syncRoutineProgress = async (routineId: string, before: LifeItem | undefined, after: Extract<LifeItem, { kind: "routine" }>, now: Date) => {
      try { await recordRoutineCompletionChanges(transaction as unknown as TempoDatabase, { userId, routineId, before, after, timezone: user.timezone, now }); }
      catch (error) {
        if (error instanceof RoutineCompletionDateError) throw new WorkspaceConflict(error.message);
        throw error;
      }
    };
    const syncGroceries = async () => {
      try { await reconcileMealGroceries(transaction as unknown as TempoDatabase, userId, localDay(new Date(), user.timezone)); }
      catch (error) {
        if (error instanceof IngredientInputError) throw new WorkspaceConflict(error.message);
        throw error;
      }
    };
    const validateWorkoutProgram = async (data: LifeItem, previous?: LifeItem) => {
      if (data.kind !== "workout" || !data.programId || (previous?.kind === "workout" && previous.programId === data.programId)) return;
      const [plan] = await transaction.select({ id: lifeItems.id }).from(lifeItems).where(and(eq(lifeItems.userId, userId), eq(lifeItems.id, data.programId), sql`${lifeItems.data}->>'kind' = 'workout_plan'`)).limit(1);
      if (!plan) throw new WorkspaceConflict("That saved workout plan is unavailable. Choose a plan from your account or log movement without a plan.");
    };
    const receiptKey = receiptId ? `life:${userId}:${receiptId}` : input.action === "save" || input.action === "patch" || input.action === "delete" ? `workspace:${userId}:${input.action}:${input.id}:${input.version}` : input.action === "stop_focus" ? `workspace:${userId}:stop_focus:${input.requestId}` : null;
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    if (receiptKey) {
      const [prior] = await transaction.select().from(lifeActionReceipts).where(and(eq(lifeActionReceipts.key, receiptKey), eq(lifeActionReceipts.userId, userId))).limit(1);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new WorkspaceConflict("This message already made a different change. Please send another message.");
        return { message: prior.message };
      }
    }
    const perform = async (): Promise<{ message: string }> => {
    if (input.action === "home_preferences") {
      if (!isDeepStrictEqual(readHomePreferences(user.workspacePreferences.home), input.expected)) throw new WorkspaceConflict("Home settings changed in another tab. Refresh and try again.");
      await transaction.update(users).set({ workspacePreferences: { ...user.workspacePreferences, home: input.preferences }, updatedAt: new Date() }).where(eq(users.id, userId));
      return { message: "Home preferences saved." };
    }
    if (input.action === "task_presentation") {
      const updated = await transaction.update(tasks).set({ presentation: { category: input.category, focusMinutes: input.focusMinutes, source: "manual", title: input.expectedTitle }, updatedAt: new Date() }).where(and(eq(tasks.userId, userId), eq(tasks.id, input.taskId), eq(tasks.title, input.expectedTitle), eq(tasks.status, "not_started"))).returning({ id: tasks.id });
      if (!updated.length) throw new WorkspaceConflict("This task changed or is already running. Refresh before editing its timer.");
      return { message: "Task icon and starting timer saved." };
    }
    if (input.action === "stop_focus") {
      const [focus] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = 'focus'`)).for("update");
      if (input.focus ? !focus || focus.id !== input.focus.id || focus.version !== input.focus.version : !!focus) throw new WorkspaceConflict("This focus session changed. Refresh before stopping it.");
      const focusedTaskId = focus?.data.kind === "focus" ? focus.data.taskId : undefined;
      if (focus && focusedTaskId !== input.task?.id) throw new WorkspaceConflict("This focus session changed. Refresh before stopping it.");
      if (input.task) {
        const [task] = await transaction.select().from(tasks).where(and(eq(tasks.id, input.task.id), eq(tasks.userId, userId))).for("update");
        if (!task || task.status !== "in_progress" || (task.startedAt?.toISOString() ?? null) !== input.task.startedAt) throw new WorkspaceConflict("This task changed. Refresh before stopping its focus session.");
        const db = transaction as unknown as TempoDatabase;
        const identity = await ensureDirectConversation(db, { userId, phoneE164: user.phoneE164 });
        const [source] = await transaction.insert(conversationMessages).values({ userId, conversationId: identity.conversationId, direction: "inbound", kind: "system", status: "processed", body: JSON.stringify(input), idempotencyKey: `web-stop-focus:${userId}:${input.requestId}`, receivedAt: new Date() }).returning();
        await new DrizzleTaskRepository(db).mutate({ userId, taskId: task.id, sourceMessageId: source.id, eventType: "updated", expectedStatus: "in_progress", changes: { status: "not_started", startedAt: null } });
      }
      if (focus) await transaction.delete(lifeItems).where(and(eq(lifeItems.id, focus.id), eq(lifeItems.userId, userId), eq(lifeItems.version, focus.version)));
      return { message: "Focus stopped for now. You can return to it later." };
    }
    if (input.action === "forget_memory") {
      const [memory] = await transaction.select().from(memoryEntries).where(and(eq(memoryEntries.userId, userId), eq(memoryEntries.id, input.id))).limit(1);
      if (!memory || memory.content !== input.expectedContent) throw new WorkspaceConflict("That memory changed or is unavailable. Refresh before removing it.");
      await transaction.update(memoryEntries).set({ deletedAt: memory.deletedAt ?? new Date(), updatedAt: new Date() }).where(and(eq(memoryEntries.id, input.id), eq(memoryEntries.userId, userId)));
      return { message: "Removed that saved memory. Conversation history is unchanged." };
    }
    if (input.action === "remove_reminder") {
      const result = await new DrizzleReminderRepository(transaction as unknown as TempoDatabase).cancel({ userId, reminderId: input.id, now: new Date() });
      if (result.kind !== "cancelled") throw new WorkspaceConflict("This reminder is unavailable or is already being sent. Refresh and try again.");
      return { message: "Removed the reminder. Messages already delivered stay in your conversation." };
    }
    if (input.action === "add_groceries") {
      const normalize = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
      const existing = await transaction.select({ data: lifeItems.data }).from(lifeItems)
        .where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = 'grocery'`, sql`${lifeItems.data}->>'checked' = 'false'`));
      const listed = new Set(existing.filter(row => row.data.kind === "grocery" && !row.data.mealSources).map(row => normalize(row.data.title)));
      const seen = new Set<string>(), added: string[] = [], alreadyListed: string[] = [];
      for (const item of input.items) {
        const title = item.trim().replace(/\s+/g, " "), key = normalize(title);
        if (seen.has(key)) continue;
        seen.add(key);
        if (listed.has(key)) alreadyListed.push(title);
        else added.push(title);
      }
      if (added.length) await transaction.insert(lifeItems).values(added.map(title => ({ id: randomUUID(), userId, data: { kind: "grocery" as const, title, checked: false } })));
      return { message: [added.length ? `Added to your shopping list: ${added.join(", ")}.` : "", alreadyListed.length ? `Already on your shopping list: ${alreadyListed.join(", ")}.` : ""].filter(Boolean).join(" ") };
    }
    if (input.action === "finish_focus") {
      const [focus] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId), eq(lifeItems.version, input.version))).limit(1);
      if (!focus || focus.data.kind !== "focus") throw new WorkspaceConflict("This focus session changed. Refresh first.");
      if (focus.data.taskId) throw new WorkspaceConflict("Complete the task to finish its focus session.");
      if (focus.data.routineId && focus.data.stepId) {
        const [routine] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.id, focus.data.routineId), eq(lifeItems.userId, userId))).limit(1);
        if (!routine || routine.data.kind !== "routine") throw new WorkspaceConflict("Routine no longer exists.");
        const stepId = focus.data.stepId;
        if (!routine.data.steps.some(step => step.id === stepId)) throw new WorkspaceConflict("This step was removed. Leave this focus session.");
        const completedAt = new Date();
        const data = { ...routine.data, steps: routine.data.steps.map(step => step.id === stepId ? { ...step, completedOn: localDay(completedAt, user.timezone) } : step) };
        await transaction.update(lifeItems).set({ data, version: sql`${lifeItems.version} + 1`, updatedAt: completedAt }).where(eq(lifeItems.id, routine.id));
        await syncRoutineProgress(routine.id, routine.data, data, completedAt);
      }
      await transaction.delete(lifeItems).where(eq(lifeItems.id, focus.id));
      return { message: "Step completed. Take a breath before the next." };
    }
    if (input.action === "patch") {
      const [existing] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId), eq(lifeItems.version, input.version))).limit(1);
      if (!existing) throw new WorkspaceConflict("This item changed elsewhere or is unavailable. Read it again before editing.");
      let data;
      try { data = applyLifePatch(existing.data, input.patch, randomUUID); }
      catch (error) { throw new WorkspaceConflict(error instanceof Error ? error.message : "That edit is invalid."); }
      await validateWorkoutProgram(data, existing.data);
      if (existing.data.kind === "grocery" && existing.data.mealSources && Object.keys(input.patch).some(key => !["kind", "checked"].includes(key))) throw new WorkspaceConflict("Edit the source meal to change its ingredients. You can check off this grocery or add a separate manual item.");
      if (data.kind === "meal" && existing.data.kind === "meal") data = { ...data, ingredientServings: existing.data.ingredientServings ?? existing.data.servings ?? data.servings, groceriesEnabled: data.groceriesEnabled ?? true };
      const completionError = workoutCompletionDateError(data, now, user.timezone);
      if (completionError) throw new WorkspaceConflict(completionError);
      const rows = await transaction.update(lifeItems).set({ data, version: sql`${lifeItems.version} + 1`, updatedAt: new Date() }).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId), eq(lifeItems.version, input.version))).returning();
      if (!rows.length) throw new WorkspaceConflict("This item changed elsewhere. Read it again before editing.");
      if (data.kind === "meal" || data.kind === "pantry") await syncGroceries();
      return { message: lifeSavedReply(data, true) };
    }
    if (input.action === "save") {
      const [existing] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId))).limit(1);
      if (input.data.kind === "note") {
        const taskId = existing?.data.kind === "note" ? existing.data.taskId : undefined;
        if (input.data.taskId && input.data.taskId !== taskId) throw new WorkspaceConflict("Thought task links are created when you add a thought to To-do.");
        input = { ...input, data: { ...input.data, ...(taskId ? { taskId } : {}) } };
      }
      await validateWorkoutProgram(input.data, existing?.data);
      if (input.sourceRecipeId && input.data.kind !== "meal") throw new WorkspaceConflict("A saved recipe can only supply ingredients for a meal plan.");
      if (input.data.kind === "grocery") {
        if (existing?.data.kind === "grocery" && existing.data.mealSources) {
          if (!isDeepStrictEqual({ ...existing.data, checked: input.data.checked }, input.data)) throw new WorkspaceConflict("Edit the source meal to change its ingredients. You can check off this grocery or add a separate manual item.");
        } else if (input.data.mealSources) throw new WorkspaceConflict("Meal grocery sources are managed by your meal plan.");
      }
      if (input.data.kind === "meal") {
        const previous = existing?.data.kind === "meal" ? existing.data : undefined;
        let meal = { ...input.data, ingredientServings: previous?.ingredientServings ?? previous?.servings ?? input.data.servings, groceriesEnabled: input.data.groceriesEnabled ?? previous?.groceriesEnabled ?? true };
        if (input.sourceRecipeId) {
          const [source] = await transaction.select({ data: lifeItems.data }).from(lifeItems).where(and(eq(lifeItems.id, input.sourceRecipeId), eq(lifeItems.userId, userId))).limit(1);
          if (!source || source.data.kind !== "recipe") throw new WorkspaceConflict("I couldn’t find that saved recipe in your account. Read your recipes before planning it.");
          if (source.data.ingredients.length > 4000) throw new WorkspaceConflict("That recipe’s ingredients are too long for a meal plan. Please shorten the saved ingredient list first.");
          meal = { ...meal, ingredients: source.data.ingredients, ingredientServings: source.data.servings, servings: meal.servings ?? source.data.servings };
        }
        input = { ...input, data: meal };
      }
      if (existing && existing.version === input.version + 1 && isDeepStrictEqual(existing.data, input.data)) return { message: "Saved." };
      if (existing && existing.data.kind !== input.data.kind) throw new WorkspaceConflict("An item's type cannot change.");
      const completionError = workoutCompletionDateError(input.data, now, user.timezone);
      if (completionError) throw new WorkspaceConflict(completionError);
      if (input.data.kind === "nutrition_target") {
        const [target] = await transaction.select({ id: lifeItems.id }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = 'nutrition_target'`)).limit(1);
        if (target && target.id !== input.id) throw new WorkspaceConflict("Nutrition targets already exist. Refresh and edit those targets.");
      }
      if (input.data.kind === "focus") {
        const focus = input.data;
        const [otherFocus] = await transaction.select({ id: lifeItems.id }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = 'focus'`)).limit(1);
        if (otherFocus && otherFocus.id !== input.id) throw new WorkspaceConflict("A focus session is already running.");
        if (focus.taskId) {
          const [task] = await transaction.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, focus.taskId), eq(tasks.userId, userId), eq(tasks.status, "in_progress"))).limit(1);
          if (!task) throw new WorkspaceConflict("Start your task before opening a focus session.");
        } else if (focus.routineId && focus.stepId) {
          const [routine] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.id, focus.routineId), eq(lifeItems.userId, userId))).limit(1);
          if (routine?.data.kind !== "routine" || !routine.data.steps.some(step => step.id === focus.stepId)) throw new WorkspaceConflict("That routine step is unavailable.");
        } else throw new WorkspaceConflict("Choose a task or routine step to focus on.");
      }
      if (input.version === 0) {
        const [saved] = await transaction.insert(lifeItems).values({ id: input.id, userId, data: input.data }).onConflictDoNothing().returning();
        if (!saved) throw new WorkspaceConflict("This item already exists. Refresh before editing.");
      } else {
        const rows = await transaction.update(lifeItems).set({ data: input.data, version: sql`${lifeItems.version} + 1`, updatedAt: new Date() }).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId), eq(lifeItems.version, input.version))).returning();
        if (!rows.length) throw new WorkspaceConflict("This item changed elsewhere. Refresh and try again.");
      }
      if (input.data.kind === "meal" || input.data.kind === "pantry") await syncGroceries();
      if (input.data.kind === "routine") await syncRoutineProgress(input.id, existing?.data, input.data, new Date());
      return { message: "Saved." };
    }
    if (input.action === "delete") {
      const rows = await transaction.delete(lifeItems).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId), eq(lifeItems.version, input.version))).returning();
      if (!rows.length) throw new WorkspaceConflict("This item changed elsewhere. Refresh and try again.");
      if (rows[0].data.kind === "grocery" && rows[0].data.mealSources) throw new WorkspaceConflict("Remove the ingredient from its source meal or turn off shopping for that meal. Manual groceries can be removed here.");
      await transaction.delete(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'routineId' = ${input.id}`));
      if (rows[0].data.kind === "meal" || rows[0].data.kind === "pantry") await syncGroceries();
      return { message: "Removed." };
    }
    if (input.action === "checkins") {
      await transaction.update(users).set({ proactiveOptIn: input.enabled, updatedAt: new Date() }).where(eq(users.id, userId));
      return { message: input.enabled ? "Check-ins enabled. Quiet hours and sending limits still apply." : "Optional check-ins turned off." };
    }
    if (input.action === "task" && input.command.type === "start_task") {
      const [activeFocus] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = 'focus'`)).limit(1);
      if (activeFocus?.data.kind === "focus" && activeFocus.data.taskId !== input.command.taskId) throw new WorkspaceConflict("Finish the current focus session first.");
    }
    const db = transaction as unknown as TempoDatabase;
    const identity = await ensureDirectConversation(db, { userId, phoneE164: user.phoneE164 });
    const key = `web-${input.action}:${userId}:${input.requestId}`;
    const body = input.action === "chat" ? input.text : JSON.stringify(input.action === "task" && input.focusMinutes !== undefined ? { ...input.command, focusMinutes: input.focusMinutes } : input.command);
    const [created] = await transaction.insert(conversationMessages).values({ userId, conversationId: identity.conversationId, direction: "inbound", kind: input.action === "chat" ? "user" : "system", status: input.action === "chat" ? "received" : "processed", body, idempotencyKey: key, receivedAt: new Date() }).onConflictDoNothing({ target: conversationMessages.idempotencyKey }).returning();
    const source = created ?? (await transaction.select().from(conversationMessages).where(and(eq(conversationMessages.idempotencyKey, key), eq(conversationMessages.userId, userId))).limit(1))[0];
    if (!source || source.body !== body) throw new WorkspaceConflict("Request already used for another change.");
    if (input.action === "chat") {
      await transaction.insert(scheduledActions).values({ userId, kind: "process_inbound_message", payload: { messageId: source.id }, idempotencyKey: `web-process:${source.id}`, runAt: new Date() }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      return { message: "Sent to Tempo. Your reply will appear here when the worker processes it." };
    }
    const context = { userId, sourceMessageId: source.id, now: new Date() };
    const result = input.action === "task" ? await executeTaskCommand(new DrizzleTaskRepository(db), input.command, context) : await executeGoalCommand(new DrizzleGoalRepository(db), input.command, context);
    if (result.kind !== "executed") throw new WorkspaceConflict(result.reply);
    if (created && input.action === "task" && input.command.type === "start_task" && input.focusMinutes !== undefined && "task" in result && result.task) {
      const [task] = await transaction.select().from(tasks).where(and(eq(tasks.id, result.task.id), eq(tasks.userId, userId)));
      const [existing] = await transaction.select({ id: lifeItems.id }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = 'focus'`));
      if (task && !existing) {
        const minutes = input.focusMinutes;
        await transaction.insert(lifeItems).values({ id: randomUUID(), userId, data: { kind: "focus", title: task.title, taskId: task.id, remaining: minutes * 60, endsAt: new Date(Date.now() + minutes * 60000).toISOString() } });
      }
    }
    return { message: result.reply };
    };
    const result = await perform();
    if (receiptKey) await transaction.insert(lifeActionReceipts).values({ key: receiptKey, userId, fingerprint, message: result.message });
    return result;
  });
}

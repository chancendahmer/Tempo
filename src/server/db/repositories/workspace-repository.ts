import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, goals, lifeItems, lifeActionReceipts, scheduledActions, tasks, users } from "../schema";
import { lifeItemSchema, localDay } from "../../domain/life-items";
import { applyLifePatch, lifePatchSchema, lifeSavedReply } from "../../domain/life-patch";
import { taskCommandSchema } from "../../domain/task-commands";
import { goalCommandSchema } from "../../domain/goal-commands";
import { executeTaskCommand } from "../../domain/task-service";
import { executeGoalCommand } from "../../domain/goal-service";
import { DrizzleTaskRepository } from "./task-repository";
import { DrizzleGoalRepository } from "./goal-repository";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { readBoard } from "./board-repository";

export const workspaceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_groceries"), items: z.array(z.string().trim().min(1).max(240)).min(1).max(20) }),
  z.object({ action: z.literal("save"), id: z.uuid(), version: z.number().int().min(0), data: lifeItemSchema }),
  z.object({ action: z.literal("patch"), id: z.uuid(), version: z.number().int().min(1), patch: lifePatchSchema }).strict(),
  z.object({ action: z.literal("delete"), id: z.uuid(), version: z.number().int().min(1) }),
  z.object({ action: z.literal("task"), requestId: z.uuid(), command: taskCommandSchema }),
  z.object({ action: z.literal("goal"), requestId: z.uuid(), command: goalCommandSchema }),
  z.object({ action: z.literal("chat"), requestId: z.uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("checkins"), enabled: z.boolean() }),
  z.object({ action: z.literal("finish_focus"), id: z.uuid(), version: z.number().int().min(1) }),
]);
export type WorkspaceAction = z.infer<typeof workspaceActionSchema>;
export class WorkspaceConflict extends Error {}

export async function readWorkspace(userId: string, database: TempoDatabase = getDatabase()) {
  const [board, allTasks, allGoals, items, messages, profile] = await Promise.all([
    readBoard(userId, new Date(), database),
    database.select({ id: tasks.id, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt, estimatedMinutes: tasks.estimatedMinutes, startedAt: tasks.startedAt, goalId: tasks.goalId }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.status, ["not_started", "in_progress", "completed"]))).orderBy(asc(tasks.dueAt), desc(tasks.createdAt)).limit(200),
    database.select({ id: goals.id, title: goals.title, description: goals.description, status: goals.status }).from(goals).where(and(eq(goals.userId, userId), inArray(goals.status, ["active", "completed"]))).orderBy(desc(goals.createdAt)).limit(100),
    database.select({ id: lifeItems.id, version: lifeItems.version, data: lifeItems.data }).from(lifeItems).where(eq(lifeItems.userId, userId)).orderBy(desc(lifeItems.createdAt)).limit(1000),
    database.select({ id: conversationMessages.id, body: conversationMessages.body, direction: conversationMessages.direction, status: conversationMessages.status, createdAt: conversationMessages.createdAt }).from(conversationMessages).where(and(eq(conversationMessages.userId, userId), inArray(conversationMessages.kind, ["user", "coach"]))).orderBy(desc(conversationMessages.createdAt)).limit(50),
    database.select({ displayName: users.displayName, proactiveOptIn: users.proactiveOptIn, quietHoursStart: users.quietHoursStart, quietHoursEnd: users.quietHoursEnd }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  return { ...board, tasks: allTasks, goals: allGoals, items, messages: messages.reverse(), profile: profile[0] };
}

export async function mutateWorkspace(userId: string, input: WorkspaceAction, database: TempoDatabase = getDatabase(), receiptId?: string) {
  input = workspaceActionSchema.parse(input);
  return database.transaction(async transaction => {
    // Serialize edits from this user's tabs, and keep source events and mutations atomic.
    const [user] = await transaction.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user) throw new WorkspaceConflict("Account unavailable.");
    const receiptKey = receiptId ? `life:${userId}:${receiptId}` : null;
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    if (receiptKey) {
      const [prior] = await transaction.select().from(lifeActionReceipts).where(and(eq(lifeActionReceipts.key, receiptKey), eq(lifeActionReceipts.userId, userId))).limit(1);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new WorkspaceConflict("This message already made a different change. Please send another message.");
        return { message: prior.message };
      }
    }
    const perform = async (): Promise<{ message: string }> => {
    if (input.action === "add_groceries") {
      const normalize = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
      const existing = await transaction.select({ data: lifeItems.data }).from(lifeItems)
        .where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = 'grocery'`, sql`${lifeItems.data}->>'checked' = 'false'`));
      const listed = new Set(existing.map(row => normalize(row.data.title)));
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
        await transaction.update(lifeItems).set({ data: { ...routine.data, steps: routine.data.steps.map(step => step.id === stepId ? { ...step, completedOn: localDay(new Date(), user.timezone) } : step) }, version: sql`${lifeItems.version} + 1`, updatedAt: new Date() }).where(eq(lifeItems.id, routine.id));
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
      const rows = await transaction.update(lifeItems).set({ data, version: sql`${lifeItems.version} + 1`, updatedAt: new Date() }).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId), eq(lifeItems.version, input.version))).returning();
      if (!rows.length) throw new WorkspaceConflict("This item changed elsewhere. Read it again before editing.");
      return { message: lifeSavedReply(data, true) };
    }
    if (input.action === "save") {
      const [existing] = await transaction.select().from(lifeItems).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId))).limit(1);
      if (existing && existing.version === input.version + 1 && isDeepStrictEqual(existing.data, input.data)) return { message: "Saved." };
      if (existing && existing.data.kind !== input.data.kind) throw new WorkspaceConflict("An item's type cannot change.");
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
      return { message: "Saved." };
    }
    if (input.action === "delete") {
      const rows = await transaction.delete(lifeItems).where(and(eq(lifeItems.id, input.id), eq(lifeItems.userId, userId), eq(lifeItems.version, input.version))).returning();
      if (!rows.length) throw new WorkspaceConflict("This item changed elsewhere. Refresh and try again.");
      await transaction.delete(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'routineId' = ${input.id}`));
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
    const body = input.action === "chat" ? input.text : JSON.stringify(input.command);
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
    return { message: result.reply };
    };
    const result = await perform();
    if (receiptKey) await transaction.insert(lifeActionReceipts).values({ key: receiptKey, userId, fingerprint, message: result.message });
    return result;
  });
}

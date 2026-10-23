import { and, eq, lte } from "drizzle-orm";
import { calculateActivityStreak } from "../../domain/activity-streak";
import { localDay, type LifeItem } from "../../domain/life-items";
import { getDatabase, type TempoDatabase } from "../client";
import { routineCompletions, taskEvents, tasks, users } from "../schema";

export const ACTIVITY_HISTORY_NOTE = "Based on saved task completions and routine steps. Earlier activity without a saved completion is not included.";
export class RoutineCompletionDateError extends Error {}

export async function readActivityStreak(userId: string, database: TempoDatabase = getDatabase(), now = new Date()) {
  const [account] = await database.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw new Error("Account unavailable.");
  const [taskHistory, routineHistory] = await Promise.all([
    database.select({ taskId: taskEvents.taskId, completedAt: taskEvents.createdAt }).from(taskEvents)
      .innerJoin(tasks, and(eq(tasks.id, taskEvents.taskId), eq(tasks.userId, userId)))
      .where(and(eq(taskEvents.userId, userId), eq(taskEvents.eventType, "completed"), lte(taskEvents.createdAt, now))),
    database.select({ routineId: routineCompletions.routineId, stepId: routineCompletions.stepId, date: routineCompletions.completedOn }).from(routineCompletions)
      .where(eq(routineCompletions.userId, userId)),
  ]);
  return {
    ...calculateActivityStreak([
      ...taskHistory.map(row => ({ key: `task:${row.taskId}`, completedAt: row.completedAt })),
      ...routineHistory.map(row => ({ key: `routine:${row.routineId}:${row.stepId}`, date: row.date })),
    ], account.timezone, now),
    historyNote: ACTIVITY_HISTORY_NOTE,
  };
}

/** Call only within the transaction that successfully saves the routine. */
export async function recordRoutineCompletionChanges(database: TempoDatabase, input: {
  userId: string;
  routineId: string;
  before?: LifeItem;
  after: Extract<LifeItem, { kind: "routine" }>;
  timezone: string;
  now: Date;
}) {
  const today = localDay(input.now, input.timezone);
  const previousSteps = input.before?.kind === "routine" ? input.before.steps : [];
  for (const step of input.after.steps) {
    const previous = previousSteps.find(candidate => candidate.id === step.id);
    if (step.completedOn === previous?.completedOn) continue;
    if (step.completedOn && step.completedOn !== today) throw new RoutineCompletionDateError("Routine steps can only be completed for your current local day.");
    if (step.completedOn === today) {
      await database.insert(routineCompletions).values({ userId: input.userId, routineId: input.routineId, stepId: step.id, completedOn: today, recordedAt: input.now }).onConflictDoNothing();
    } else if (previous?.completedOn === today) {
      // Undoing today's checkbox reverses that checkoff. Advancing to a new day,
      // editing/removing a step, or deleting the routine preserves earlier days.
      await database.delete(routineCompletions).where(and(eq(routineCompletions.userId, input.userId), eq(routineCompletions.routineId, input.routineId), eq(routineCompletions.stepId, step.id), eq(routineCompletions.completedOn, today)));
    }
  }
}

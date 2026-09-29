import { and, asc, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { getDatabase, TempoDatabase } from "../client";
import { calendarBusyWindows, calendarConnections, reminders, tasks, users } from "../schema";

/** Read model only: all changes continue through the assistant's audited tools. */
export async function readBoard(userId: string, now = new Date(), database: TempoDatabase = getDatabase()) {
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
  const [profile] = await database.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!profile) throw new Error("Board account not found");
  const [openTasks, upcoming, calendar, busy] = await Promise.all([
    database.select({ id: tasks.id, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt, estimatedMinutes: tasks.estimatedMinutes })
      .from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.status, ["not_started", "in_progress"])))
      .orderBy(asc(tasks.dueAt), asc(tasks.createdAt)).limit(20),
    database.select({ id: reminders.id, text: reminders.text, remindAt: reminders.remindAt, status: reminders.status })
      .from(reminders).where(and(eq(reminders.userId, userId), inArray(reminders.status, ["scheduled", "sending", "sent", "failed"]),
        gte(reminders.remindAt, new Date(now.getTime() - 60 * 60_000)), lte(reminders.remindAt, horizon)))
      .orderBy(asc(reminders.remindAt)).limit(30),
    database.select({ status: calendarConnections.status, lastSyncedAt: calendarConnections.lastSyncedAt })
      .from(calendarConnections).where(eq(calendarConnections.userId, userId)).limit(1),
    database.select({ id: calendarBusyWindows.id, startsAt: calendarBusyWindows.startsAt, endsAt: calendarBusyWindows.endsAt })
      .from(calendarBusyWindows).innerJoin(calendarConnections, eq(calendarConnections.id, calendarBusyWindows.connectionId))
      .where(and(eq(calendarBusyWindows.userId, userId), eq(calendarConnections.userId, userId), eq(calendarConnections.status, "active"),
        gt(calendarBusyWindows.endsAt, now), lte(calendarBusyWindows.startsAt, horizon)))
      .orderBy(asc(calendarBusyWindows.startsAt)).limit(20),
  ]);
  return { timezone: profile.timezone, generatedAt: now, tasks: openTasks, reminders: upcoming, calendar: calendar[0] ?? null, busy };
}

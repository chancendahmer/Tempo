import { and, asc, eq, gt, lt } from "drizzle-orm";
import { SchedulingRepository } from "../../domain/reschedule-service";
import { isQuietTime, localTime } from "../../domain/context-engine";
import { getDatabase, TempoDatabase } from "../client";
import { calendarBusyWindows, calendarConnections, users } from "../schema";

function offsetMinutesFor(date: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

function startOfNextLocalDay(now: Date, timezone: string): Date {
  const [year, month, day] = localTime(now, timezone).date.split("-").map(Number);
  const nominalUtc = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0);
  const offset = offsetMinutesFor(new Date(nominalUtc + 12 * 3_600_000), timezone);
  return new Date(nominalUtc - offset * 60_000);
}

function roundUpToQuarterHour(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / (15 * 60_000)) * 15 * 60_000);
}

export class DrizzleSchedulingRepository implements SchedulingRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async findNextFreeStart(input: Parameters<SchedulingRepository["findNextFreeStart"]>[0]) {
    const [user, connection] = await Promise.all([
      this.database.select({
        timezone: users.timezone,
        quietHoursStart: users.quietHoursStart,
        quietHoursEnd: users.quietHoursEnd,
      }).from(users).where(eq(users.id, input.userId)).limit(1),
      this.database.select({ id: calendarConnections.id, lastSyncedAt: calendarConnections.lastSyncedAt })
        .from(calendarConnections).where(and(
          eq(calendarConnections.userId, input.userId),
          eq(calendarConnections.status, "active"),
        )).limit(1),
    ]);
    if (!user[0] || !connection[0]?.lastSyncedAt || input.now.getTime() - connection[0].lastSyncedAt.getTime() > 45 * 60_000) {
      return null;
    }
    const horizon = new Date(input.now.getTime() + 14 * 86_400_000);
    const windows = await this.database.select({
      startsAt: calendarBusyWindows.startsAt,
      endsAt: calendarBusyWindows.endsAt,
    }).from(calendarBusyWindows).where(and(
      eq(calendarBusyWindows.connectionId, connection[0].id),
      lt(calendarBusyWindows.startsAt, horizon),
      gt(calendarBusyWindows.endsAt, input.now),
    )).orderBy(asc(calendarBusyWindows.startsAt));

    const minimum = input.afterToday
      ? startOfNextLocalDay(input.now, user[0].timezone)
      : new Date(input.now.getTime() + 60 * 60_000);
    let candidate = roundUpToQuarterHour(minimum);
    const durationMs = Math.max(15, Math.min(input.durationMinutes, 240)) * 60_000;
    while (candidate < horizon) {
      const end = new Date(candidate.getTime() + durationMs);
      const quiet = isQuietTime(candidate, user[0].timezone, user[0].quietHoursStart, user[0].quietHoursEnd)
        || isQuietTime(new Date(end.getTime() - 1), user[0].timezone, user[0].quietHoursStart, user[0].quietHoursEnd);
      const overlap = windows.find((window) => window.startsAt < end && window.endsAt > candidate);
      if (!quiet && !overlap) return candidate;
      candidate = roundUpToQuarterHour(overlap?.endsAt ?? new Date(candidate.getTime() + 15 * 60_000));
    }
    return null;
  }
}

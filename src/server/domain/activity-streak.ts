import { z } from "zod";
import { localDay } from "./life-items";

/** A saved completion, never an inferred completion from a plan or due date. */
export type ActivityCompletion = { key: string } & (
  | { completedAt: Date; date?: never }
  | { date: string; completedAt?: never }
);

export type ActivityStreak = {
  totalActiveDays: number;
  totalCompletions: number;
  bestDays: number;
  currentDays: number;
  activeToday: boolean;
  completedToday: number;
  latestActivityDay: string | null;
  recentDays: Array<{ date: string; active: boolean; completed: number }>;
};

function shiftDay(date: string, amount: number) {
  // Calendar arithmetic on date labels avoids 23/25-hour DST day assumptions.
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

/**
 * One or more completed tasks/routine steps makes an active account-local day.
 * Yesterday's run remains current while today is still available. Multiple
 * completions of the same item on the same day count once; no missing days are
 * filled in. Timestamped history is interpreted using the account's timezone.
 */
export function calculateActivityStreak(completions: readonly ActivityCompletion[], timezone: string, now = new Date()): ActivityStreak {
  const today = localDay(now, timezone);
  const days = new Map<string, Set<string>>();
  for (const completion of completions) {
    if (completion.completedAt && (!Number.isFinite(completion.completedAt.getTime()) || completion.completedAt > now)) continue;
    const date = completion.completedAt ? localDay(completion.completedAt, timezone) : completion.date;
    if (!z.iso.date().safeParse(date).success || date > today) continue;
    const keys = days.get(date) ?? new Set<string>();
    keys.add(completion.key);
    days.set(date, keys);
  }
  const activeToday = days.has(today);
  let date = activeToday ? today : shiftDay(today, -1);
  let currentDays = 0;
  while (days.has(date)) {
    currentDays += 1;
    date = shiftDay(date, -1);
  }
  const recordedDays = [...days.keys()].sort();
  let run = 0, bestDays = 0;
  recordedDays.forEach((day, index) => {
    run = index > 0 && shiftDay(recordedDays[index - 1], 1) === day ? run + 1 : 1;
    bestDays = Math.max(bestDays, run);
  });
  return {
    totalActiveDays: days.size,
    totalCompletions: [...days.values()].reduce((total, keys) => total + keys.size, 0),
    bestDays,
    currentDays,
    activeToday,
    completedToday: days.get(today)?.size ?? 0,
    latestActivityDay: [...days.keys()].sort().at(-1) ?? null,
    recentDays: Array.from({ length: 7 }, (_, index) => {
      const date = shiftDay(today, index - 6);
      const completed = days.get(date)?.size ?? 0;
      return { date, active: completed > 0, completed };
    }),
  };
}

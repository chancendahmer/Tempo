import { localDay, type LifeItem } from "./life-items";

/** A workout is a completed log; future intent belongs in a task or plan. */
export function workoutCompletionDateError(item: LifeItem, now: Date, timezone: string): string | null {
  return item.kind === "workout" && item.date > localDay(now, timezone)
    ? "Choose today or an earlier date for completed movement. Schedule a task for a future session."
    : null;
}

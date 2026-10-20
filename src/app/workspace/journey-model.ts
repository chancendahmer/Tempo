import { localDay } from "../../server/domain/life-items";

/** Milestones count recorded active days, never consecutive days or inferred activity. */
export const journeyStops = [
  { days: 0, name: "The beginning", title: "Every journey starts somewhere.", detail: "You don’t need a perfect plan. One small thing is a place to start.", x: 14, y: 80 },
  { days: 3, name: "First light", title: "Small steps, real beginnings.", detail: "Three days of showing up for something that matters to you.", x: 29, y: 63 },
  { days: 7, name: "Finding your feet", title: "A week of days, at your pace.", detail: "Seven active days. They don’t have to be in a row to count.", x: 39, y: 49 },
  { days: 14, name: "The open trail", title: "Look at the ground you’ve covered.", detail: "Fourteen active days, made up of your own small steps.", x: 55, y: 43 },
  { days: 30, name: "A wider view", title: "A little effort has added up.", detail: "Thirty active days. There is no deadline for getting here.", x: 62, y: 31 },
  { days: 60, name: "New horizons", title: "There’s still more to discover.", detail: "Sixty active days. Your recorded days keep growing beyond this trail.", x: 81, y: 25 },
] as const;

export function journeyProgress(days: number) {
  const earnedDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  const index = journeyStops.findLastIndex(stop => earnedDays >= stop.days);
  const current = journeyStops[index];
  const next = journeyStops[index + 1];
  return { earnedDays, index, level: index + 1, current, next, remaining: next ? next.days - earnedDays : 0,
    percent: next ? Math.round((earnedDays - current.days) / (next.days - current.days) * 100) : 100 };
}

// Original Tempo encouragement, not quotations attributed to other people or live AI.
const encouragement = [
  "You don’t have to see the whole path. Just the next step.",
  "The small things you do for yourself deserve to be noticed.",
  "A slower day still belongs in your story.",
  "You can start again without starting from nothing.",
  "Make the next step small enough to feel possible.",
  "Some days are for moving forward. Some are for catching your breath.",
  "A little less perfect. A little more possible.",
  "Coming back is a kind of progress, too.",
  "There’s room on this path for your kind of day.",
  "One thing finished. One thing less to carry.",
  "You’re allowed to change the plan and keep going.",
  "Let today be a small chapter, if that’s what you need.",
  "Your pace doesn’t have to look like anyone else’s.",
  "The next step can be kind to you.",
];
export function dailyEncouragement(now: Date, timezone: string) {
  const day = localDay(now, timezone);
  const ordinal = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);
  return encouragement[ordinal % encouragement.length];
}

/** Ignore taps, diagonal/vertical scrolling and gestures starting on controls. */
export function journeySwipe(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x, dy = end.y - start.y;
  return Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 2 ? dx < 0 ? "journey" : "today" : null;
}

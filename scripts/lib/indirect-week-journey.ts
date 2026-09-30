import { isDeepStrictEqual } from "node:util";
import type { WeekStep } from "./week-journey";
import { workspaceProductState } from "./workspace-evaluation";
import type { Workspace } from "./workspace-journey";

type Context = Parameters<NonNullable<WeekStep["expectation"]>>[0];
type Check = (context: Context) => string[] | Promise<string[]>;
type Scope = keyof ReturnType<typeof workspaceProductState>;
export type IndirectStep = WeekStep & { allowedScopes: Scope[] };
const requireThat = (ok: boolean, issue: string) => ok ? [] : [issue];
const items = (w: Workspace, kind: string) => w.items.filter(row => row.data.kind === kind);

/** Mutation expectations constrain unrelated records as well as the requested result. */
function step(day: string, message: string, allowed: Scope[], check: Check, calendarWrites = 0): IndirectStep {
  return { day, message, channel: day === "Tuesday" || day === "Thursday" || day === "Saturday" ? "web" : "sms",
    allowedScopes: allowed,
    fixture: "Indirect language; live model only; isolated account and calendar fixture", verify: () => true,
    expectation: async context => {
      const before = workspaceProductState(context.before), after = workspaceProductState(context.after);
      const issues = (Object.keys(before) as Scope[]).filter(key => !allowed.includes(key) && !isDeepStrictEqual(before[key], after[key])).map(key => `Unexpected ${key} mutation.`);
      issues.push(...await check(context));
      if (context.simulator.calendarWrites.length !== calendarWrites) issues.push("Unexpected calendar write count or missing confirmation write.");
      return issues;
    } };
}

function created(kind: string, predicate: (w: Workspace) => boolean): Check {
  return ({ before, after }) => {
    const added = after.items.filter(row => !before.items.some(old => old.id === row.id));
    return requireThat(added.length === 1 && added[0].data.kind === kind && predicate(after)
      && before.items.every(old => after.items.some(row => isDeepStrictEqual(old, row))), `Expected exactly one ${kind}, preserving all existing items.`);
  };
}
function edited(kind: string, patch: Record<string, unknown>): Check {
  return ({ before, after }) => {
    const old = items(before, kind)[0], next = after.items.find(row => row.id === old?.id);
    return requireThat(Boolean(old && next && next.version === old.version + 1 && isDeepStrictEqual(next.data, { ...old.data, ...patch }))
      && before.items.length === after.items.length && before.items.filter(row => row.id !== old?.id).every(row => after.items.some(next => isDeepStrictEqual(row, next))), `Expected an in-place ${kind} edit preserving unrelated fields and records; missing prerequisite also fails.`);
  };
}
const replyHas = (pattern: RegExp): Check => ({ turn }) => requireThat(turn.replies.some(reply => pattern.test(reply)), `Reply did not address expected content: ${pattern.source}. Human review still required.`);

/** Fixed virtual dates prevent a changing real-world clock from changing expected dates. No scripted answers are provided. */
export const indirectWeekJourney: IndirectStep[] = [
  step("Monday", "I'm new here and my head is a mess. What's one easy thing I can do with you?", [], replyHas(/\?|try|start|tell|help/i)),
  step("Monday", "Could you put renewing my library card on my plate? I need to get around to it this week.", ["tasks"], ({ before, after }) => requireThat(after.tasks.length === before.tasks.length + 1 && after.tasks.some(t => /library card/i.test(t.title)), "Library card task was not created exactly once.")),
  step("Monday", "Actually call that renewing the family library cards; same thing, just a better name.", ["tasks"], ({ before, after }) => {
    const old = before.tasks.find(t => /library card/i.test(t.title));
    const next = after.tasks.find(t => t.id === old?.id);
    return requireThat(Boolean(old && next && /family library cards/i.test(next.title) && isDeepStrictEqual(next, { ...old, title: next.title })) && after.tasks.length === before.tasks.length, "Task correction failed to preserve identity and unrelated fields.");
  }),
  step("Monday", "Longer term, I'd love to be someone who can run a half marathon by the end of this year. Put that somewhere I can work toward it.", ["goals"], ({ before, after }) => requireThat(after.goals.length === before.goals.length + 1 && after.goals.some(g => /half marathon/i.test(g.title)), "Long-term aspiration did not become one goal.")),
  step("Tuesday", "This lemon rice is a keeper: rice and lemon, cook the rice then stir in the lemon. It feeds two and takes 20 minutes. Keep it where I can find it when I'm cooking again.", ["items"], created("recipe", w => items(w, "recipe").some(r => r.data.kind === "recipe" && /lemon rice/i.test(r.data.title) && /rice/i.test(r.data.ingredients) && /lemon/i.test(r.data.instructions) && r.data.servings === 2 && r.data.prepMinutes === 20))),
  step("Tuesday", "That actually feeds four, not two. Everything else was right.", ["items"], edited("recipe", { servings: 4 })),
  step("Tuesday", "Let's have that lemon rice Thursday evening, January 14. Put it in my dinners for the week; I haven't eaten it yet.", ["items"], created("meal", w => items(w, "meal").some(r => r.data.kind === "meal" && /lemon rice/i.test(r.data.title) && r.data.date === "2027-01-14" && r.data.meal === "Dinner"))),
  step("Tuesday", "Friday instead for that dinner, January 15.", ["items"], edited("meal", { date: "2027-01-15" })),
  step("Wednesday", "For today's breakfast diary I had yogurt. The pot says 100 calories and 8 grams of protein. I don't know the other numbers.", ["items"], created("food", w => items(w, "food").some(r => r.data.kind === "food" && /yogurt/i.test(r.data.title) && r.data.date === "2027-01-13" && r.data.meal === "Breakfast" && r.data.calories === 100 && r.data.protein === 8 && r.data.carbs === null && r.data.fat === null && r.data.fiber === null))),
  step("Wednesday", "Oops, the protein on that was 12 grams. Leave the rest alone.", ["items"], edited("food", { protein: 12 })),
  step("Wednesday", "Would eating more vegetables make lunch easier? I'm just looking for ideas, don't put anything on my plan yet.", [], replyHas(/vegetable|lunch/i)),
  step("Wednesday", "I want an 8 AM sequence I can follow every morning: two minutes drinking water, then five minutes stretching. Put that in my morning section.", ["items"], created("routine", w => items(w, "routine").some(r => r.data.kind === "routine" && r.data.time === "08:00" && r.data.period === "morning" && r.data.steps.length === 2 && /water/i.test(r.data.steps[0].title) && r.data.steps[0].minutes === 2 && /stretch/i.test(r.data.steps[1].title) && r.data.steps[1].minutes === 5))),
  step("Wednesday", "Could that start at half past eight instead? The two steps are fine.", ["items"], edited("routine", { time: "08:30" })),
  step("Thursday", "Give me a nudge tomorrow at nine in the morning so I don't leave without my lunch.", ["reminders"], async ({ user }) => {
    const rows = (await user.state()).reminders;
    return requireThat(rows.length === 1 && /lunch/i.test(rows[0].text) && rows[0].status === "scheduled" && rows[0].remindAt.toISOString() === "2027-01-15T14:00:00.000Z", "Lunch nudge missing, duplicated, or scheduled for wrong local date/time.");
  }),
  step("Thursday", "Never mind the lunch nudge, my partner's bringing it. Don't ping me for that.", ["reminders"], async ({ user }) => {
    const rows = (await user.state()).reminders;
    return requireThat(rows.length === 1 && /lunch/i.test(rows[0].text) && rows[0].status === "cancelled", "Lunch cancellation failed or its prerequisite was missing.");
  }),
  step("Thursday", "What time is that teeth appointment tomorrow?", [], replyHas(/dentist|2\s*(?:pm|p\.m\.)|14:00/i)),
  step("Thursday", "I can't make two. Push the dentist visit to four tomorrow, still an hour.", [], ({ turn }) => requireThat(turn.replies.some(r => /confirm|YES/i.test(r)) && turn.replies.some(r => /4|16:00/.test(r)), "Dentist reschedule failed to propose 4 PM and request confirmation.")),
  step("Thursday", "YES", [], ({ simulator, user }) => {
    const row = simulator.calendarWrites[0];
    return requireThat(Boolean(row && row.userId === user.id && row.change.operation === "update" && row.change.eventId === "fixture-dentist" && new Date(row.change.start ?? "").getTime() === Date.parse("2027-01-15T21:00:00.000Z") && new Date(row.change.end ?? "").getTime() === Date.parse("2027-01-15T22:00:00.000Z")), "Confirmed calendar edit has wrong account, event, or time.");
  }, 1),
  step("Friday", "The family library cards are renewed now, you can tick that off.", ["tasks"], ({ before, after }) => {
    const old = before.tasks.find(t => /family library cards/i.test(t.title));
    return requireThat(Boolean(old && after.tasks.some(t => isDeepStrictEqual(t, { ...old, status: "completed" }))) && before.tasks.length === after.tasks.length, "Completion did not update the existing family library task only.");
  }, 1),
  step("Friday", "I got a 25 minute walk in today. Put that with my exercise.", ["items"], created("workout", w => items(w, "workout").some(r => r.data.kind === "workout" && r.data.minutes === 25 && r.data.activity === "Walk" && r.data.date === "2027-01-15")), 1),
  step("Saturday", "Can you see the steps on my Google health account or do I need to do something?", [], replyHas(/not (?:connected|available|supported)|don't have access|do not have access|can't (?:access|read|connect)|cannot (?:access|read|connect)|isn't (?:connected|available|supported)/i), 1),
  step("Saturday", "What's that rice dish I kept earlier in the week, and how many does it feed now?", [], ({ turn }) => requireThat(turn.replies.some(r => /lemon/i.test(r) && /four|4/.test(r)), "Cross-day recipe recall missed the corrected serving count."), 1),
  step("Saturday", "Maybe get rid of that? I'm not sure which one I mean yet.", [], replyHas(/which|what|clarif|mean|sure/i), 1),
  step("Sunday", "Can you give me the bigger picture for this week, January 11 through 17, including what I'm working toward and what's on my calendar?", [], ({ turn }) => requireThat(turn.replies.some(r => /half marathon/i.test(r)) && turn.replies.some(r => /dentist/i.test(r) && /(?:4(?::00)?\s*p\.?m\.?|16:00|four\s*(?:p\.?m\.?|in the afternoon))/i.test(r) && !/(?:2(?::00)?\s*p\.?m\.?|14:00)/i.test(r)), "Weekly overview omitted the goal or rescheduled 4 PM dentist, or reported stale 2 PM time."), 1),
  step("Sunday", "How do I get to the place with my meals in the app? I'm a bit lost.", [], replyHas(/meal/i), 1),
];

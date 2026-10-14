import type { SavedLifeItem } from "@/server/domain/life-items";
import { demoRecipes, savedDemoRecipe } from "./demo-recipes";

export type Workspace = {
  timezone: string;
  tasks: { id: string; title: string; status: string; dueAt: string | null; estimatedMinutes: number | null; startedAt: string | null; goalId: string | null }[];
  goals: { id: string; title: string; description: string | null; status: string }[];
  items: SavedLifeItem[];
  memories?: { id: string; content: string; category: string }[];
  memoriesTruncated?: boolean;
  remindersTruncated?: boolean;
  messages: { id: string; body: string; direction: string; status: string; createdAt: string }[];
  reminders: { id: string; text: string; remindAt: string; status: string }[];
  calendar: { status: string; lastSyncedAt: string | null } | null;
  busy: { id: string; startsAt: string; endsAt: string }[];
  demoCalendarEvents?: { id: string; title: string; startsAt: string; endsAt: string }[];
  profile: { displayName: string | null; phoneLast4?: string; proactiveOptIn: boolean; quietHoursStart: string | null; quietHoursEnd: string | null };
};
export const demoId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function previewWorkspace(now = new Date()): Workspace {
  const day = (offset = 0) => { const d = new Date(now); d.setDate(d.getDate() + offset); return new Intl.DateTimeFormat("en-CA").format(d); };
  const date = day();
  const at = (hour: number, offset = 0, minute = 0) => { const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
  const task = (id: number, title: string, minutes: number, dueAt: string | null, goal: number | null = null, status = "not_started") => ({ id: demoId(id), title, status, estimatedMinutes: minutes, dueAt, startedAt: null, goalId: goal ? demoId(goal) : null });
  const demoCalendarEvents = [
    { id: demoId(71), title: "Design lab · Engineering building", startsAt: at(14), endsAt: at(15) },
    { id: demoId(72), title: "Project team catch-up", startsAt: at(11, 1), endsAt: at(11, 1, 30) },
    { id: demoId(73), title: "Coffee with Sam", startsAt: at(10, 3), endsAt: at(11, 3) },
  ];
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, profile: { displayName: "Alex", proactiveOptIn: true, quietHoursStart: "22:00", quietHoursEnd: "08:00" },
    tasks: [
      task(1, "Write the first paragraph of my project brief", 15, at(10), 10),
      task(2, "Walk home from design lab", 20, at(15, 0, 10), 11),
      task(3, "Pick up broccoli, yogurt & lemons", 20, at(17)),
      task(4, "Outline three points for the project brief", 10, at(10, -1), 10, "completed"),
      task(5, "Full-body foundations · Session A", 35, at(18, 1), 11),
      task(6, "Practice the first four guitar chords", 10, at(19, 2), 12),
      task(7, "Tune the guitar", 5, at(18, -1), 12, "completed"),
      task(8, "Send the project draft to my team", 10, at(16, 2), 10),
      task(9, "Book a haircut", 5, null),
    ],
    goals: [
      { id: demoId(10), title: "Finish my design project", description: "Have a draft I can share with my team this week.", status: "active" },
      { id: demoId(11), title: "Build a movement routine", description: "Two strength sessions a week, with walks when they fit.", status: "active" },
      { id: demoId(12), title: "Learn a song on guitar", description: "Ten minutes at a time. Start with the chords to Hey There Delilah.", status: "active" },
    ],
    items: [
      { id: demoId(20), version: 1, data: { kind: "routine", title: "A softer start", period: "morning", time: "08:00", steps: [{ id: demoId(21), title: "Open the curtains", minutes: 1, completedOn: date }, { id: demoId(22), title: "Drink a glass of water", minutes: 2, completedOn: date }, { id: demoId(23), title: "Breakfast & a moment to yourself", minutes: 15, completedOn: null }, { id: demoId(24), title: "Choose one thing for today", minutes: 3, completedOn: null }] } },
      { id: demoId(30), version: 1, data: { kind: "routine", title: "Let the day settle", period: "evening", time: "21:00", steps: [{ id: demoId(31), title: "A five-minute tidy", minutes: 5, completedOn: null }, { id: demoId(32), title: "Set out tomorrow’s essentials", minutes: 3, completedOn: null }, { id: demoId(33), title: "Put your phone to bed", minutes: 2, completedOn: null }] } },
      { id: demoId(40), version: 1, data: { kind: "food", title: "Blueberry yogurt bowl · sample estimate", date, meal: "Breakfast", calories: 360, protein: 23, carbs: 50, fat: 8, fiber: 4, source: "manual" } },
      { id: demoId(43), version: 1, data: { kind: "food", title: "Chickpea couscous · sample estimate", date: day(-1), meal: "Lunch", calories: 420, protein: 15, carbs: 65, fat: 11, fiber: 10, source: "manual" } },
      ...demoRecipes.map((recipe, index) => ({ id: demoId(100 + index), version: 1, data: savedDemoRecipe(recipe) })),
      ...Array.from({ length: 7 }, (_, offset) => [0, 1, offset % 2 === 0 ? 2 : 3].map((recipeIndex, slot) => {
        const recipe = demoRecipes[recipeIndex];
        return { id: demoId(200 + offset * 3 + slot), version: 1, data: { kind: "meal" as const, title: recipe.title, date: day(offset), meal: (["Breakfast", "Lunch", "Dinner"] as const)[slot], ingredients: recipe.ingredients, servings: recipe.servings } };
      })).flat(),
      { id: demoId(50), version: 1, data: { kind: "note", title: "A smaller Sunday reset", body: "Put on a playlist. Start the laundry, check the fridge, then write the grocery list. Twenty minutes is enough to start." } },
      { id: demoId(51), version: 1, data: { kind: "note", title: "Project idea: a desk that reminds me", body: "Try a small light next to my monitor when it is time to leave for class. Ask the design team about it at our catch-up." } },
      { id: demoId(52), version: 1, data: { kind: "note", title: "Meals I actually want to repeat", body: "The lemon chicken bowl works well for dinner. Keep couscous ingredients around for a quick lunch. Check what is already in the fridge before shopping." } },
      { id: demoId(60), version: 1, data: { kind: "workout", title: "A walk around the neighborhood", date, minutes: 20, activity: "Walk" } },
      { id: demoId(61), version: 1, data: { kind: "workout", title: "Full-body foundations · Session B", date: day(-2), minutes: 35, activity: "Strength" } },
      { id: demoId(62), version: 1, data: { kind: "workout", title: "Walk to the library", date: day(-1), minutes: 15, activity: "Walk" } },
      ...["Broccoli · 1 head", "Plain Greek yogurt · 1 tub", "Lemons · 3", "Blueberries · 1 punnet", "Chicken breast · 300 g", "Cucumber · 1", "Cherry tomatoes · 1 pack", "Chickpeas · 2 cans", "Brown rice", "Oat granola"].map((title, index) => ({ id: demoId(300 + index), version: 1, data: { kind: "grocery" as const, title, checked: index >= 8 } })),
    ],
    memories: [
      { id: demoId(90), content: "I prefer one small next step to a long list of suggestions.", category: "preference" },
      { id: demoId(91), content: "My morning goes more smoothly when my bag is packed the night before.", category: "routine" },
      { id: demoId(92), content: "I like quick lunches and have dumbbells available for workouts.", category: "preference" },
    ],
    messages: [
      { id: demoId(80), body: "Example conversation · fictional account, not a live AI response. Try the controls in To-do, Meals and Routines; changes reset on reload.", direction: "outbound", status: "delivered", createdAt: at(18, -1) },
      { id: demoId(81), body: "The design project feels like a lot. Can we just start with the first paragraph?", direction: "inbound", status: "processed", createdAt: at(18, -1, 1) },
      { id: demoId(82), body: "One paragraph is a good start. There’s a 15-minute task in your To-do, linked to Finish my design project. You can start the timer there.", direction: "outbound", status: "delivered", createdAt: at(18, -1, 2) },
      { id: demoId(83), body: "Keep that lemon chicken bowl somewhere I can find it again.", direction: "inbound", status: "processed", createdAt: at(18, -1, 3) },
      { id: demoId(84), body: "It’s in Recipes, with ingredients and steps. Choose Plan a meal when you want to put it on your menu.", direction: "outbound", status: "delivered", createdAt: at(18, -1, 4) },
    ],
    reminders: [
      { id: demoId(70), text: "Prepare a few notes for the team catch-up", remindAt: at(10, 1, 30), status: "scheduled" },
      { id: demoId(74), text: "Pack your gym bag for Session A", remindAt: at(17, 1, 30), status: "scheduled" },
      { id: demoId(75), text: "Check the fridge before planning next week", remindAt: at(11, 4), status: "scheduled" },
    ],
    calendar: null, demoCalendarEvents, busy: demoCalendarEvents.map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt })),
  };
}

import type { SavedLifeItem } from "@/server/domain/life-items";

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
  profile: { displayName: string | null; proactiveOptIn: boolean; quietHoursStart: string | null; quietHoursEnd: string | null };
};
export const demoId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function previewWorkspace(): Workspace {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA").format(now);
  const at = (hour: number) => { const d = new Date(now); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, profile: { displayName: "Alex", proactiveOptIn: true, quietHoursStart: "22:00", quietHoursEnd: "08:00" },
    tasks: [
      { id: demoId(1), title: "Make room for your most important thing", status: "not_started", estimatedMinutes: 25, dueAt: at(10), startedAt: null, goalId: demoId(10) },
      { id: demoId(2), title: "A little fresh air", status: "not_started", estimatedMinutes: 15, dueAt: at(12), startedAt: null, goalId: demoId(11) },
      { id: demoId(3), title: "Plan a simple dinner", status: "not_started", estimatedMinutes: 10, dueAt: at(17), startedAt: null, goalId: null },
      { id: demoId(4), title: "Clear a little space on your desk", status: "completed", estimatedMinutes: 5, dueAt: at(9), startedAt: null, goalId: demoId(10) },
    ],
    goals: [{ id: demoId(10), title: "Make space for meaningful work", description: "Small, focused steps toward the things that matter.", status: "active" }, { id: demoId(11), title: "Move in a way that feels good", description: "More fresh air. More energy. No perfect streak required.", status: "active" }],
    items: [
      { id: demoId(20), version: 1, data: { kind: "routine", title: "A softer start", period: "morning", time: "08:00", steps: [{ id: demoId(21), title: "Open the curtains", minutes: 1, completedOn: date }, { id: demoId(22), title: "Drink a glass of water", minutes: 2, completedOn: date }, { id: demoId(23), title: "Breakfast & a moment to yourself", minutes: 15, completedOn: null }, { id: demoId(24), title: "Choose one thing for today", minutes: 3, completedOn: null }] } },
      { id: demoId(30), version: 1, data: { kind: "routine", title: "Let the day settle", period: "evening", time: "21:00", steps: [{ id: demoId(31), title: "A five-minute tidy", minutes: 5, completedOn: null }, { id: demoId(32), title: "Set out tomorrow’s essentials", minutes: 3, completedOn: null }, { id: demoId(33), title: "Put your phone to bed", minutes: 2, completedOn: null }] } },
      { id: demoId(40), version: 1, data: { kind: "food", title: "Yogurt, blueberries & granola", date, meal: "Breakfast", calories: 360, protein: 22, carbs: 48, fat: 9, fiber: 5 } },
      { id: demoId(41), version: 1, data: { kind: "meal", title: "Lemon chicken grain bowl", date, meal: "Dinner", ingredients: "Chicken\nBrown rice\nBroccoli\nLemon" } },
      { id: demoId(42), version: 1, data: { kind: "meal", title: "Avocado & egg toast", date, meal: "Lunch", ingredients: "Bread\nAvocado\nEggs" } },
      { id: demoId(50), version: 1, data: { kind: "note", title: "A thought for later", body: "Try a Sunday reset: groceries, a little laundry, and something nice to look forward to." } },
      { id: demoId(60), version: 1, data: { kind: "workout", title: "A walk around the neighborhood", date, minutes: 20, activity: "Walk" } },
    ],
    memories: [{ id: demoId(90), content: "I prefer gentle check-ins and small next steps.", category: "preference" }],
    messages: [{ id: demoId(80), body: "This is a sample workspace. Explore your day, try a focus timer, or build a routine. Changes here reset when you reload; no messages are sent.", direction: "outbound", status: "delivered", createdAt: now.toISOString() }],
    reminders: [{ id: demoId(70), text: "Take a proper lunch break", remindAt: at(12), status: "scheduled" }],
    calendar: { status: "active", lastSyncedAt: now.toISOString() }, busy: [{ id: demoId(71), startsAt: at(14), endsAt: at(15) }],
  };
}

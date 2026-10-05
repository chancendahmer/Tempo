import { buildRundown, localDate } from "./rundown";

/** Read at dispatch, scoped to the reminder owner. No model-generated snapshot. */
export async function reminderDeliveryBody(
  reminder: { id: string; userId: string; text: string; timezone: string; contentMode?: "text" | "daily_rundown" },
  repositories: Parameters<typeof buildRundown>[0],
  now: Date,
) {
  if (reminder.contentMode !== "daily_rundown") return "Reminder: " + reminder.text;
  const reminders = repositories.reminders;
  const plan = await buildRundown({ ...repositories, reminders: reminders && {
    listForRundown: async (userId, start, end) => (await reminders.listForRundown(userId, start, end)).filter(row => row.id !== reminder.id),
  } }, reminderContext(reminder, now), { startDate: localDate(now, reminder.timezone), days: 1 });
  return "Your daily briefing\n" + plan;
}

function reminderContext(reminder: {userId: string; timezone: string}, now: Date) {
  return { userId: reminder.userId, timezone: reminder.timezone, now };
}

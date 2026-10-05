import { expect, it, vi } from "vitest";
import { reminderDeliveryBody } from "./reminder-delivery-body";
const now = new Date("2026-10-06T01:00:00Z");
const reminder = { id: "briefing", userId: "person-a", text: "My daily plan", timezone: "America/Los_Angeles", contentMode: "daily_rundown" as const };
it("reads the current account plan at delivery in its local day, not the scheduled snapshot", async () => {
  const task = { id: "task", title: "Newly added homework", goalId: null, status: "not_started" as const, dueAt: new Date("2026-10-06T02:00:00Z"), estimatedMinutes: 10 };
  const tasks = { list: vi.fn(async () => [task]) }, goals = { list: vi.fn(async () => []) };
  const integrations = { agenda: vi.fn(async () => JSON.stringify({ events: [{title:"Changed appointment", start:{ dateTime:"2026-10-06T02:30:00-00:00" }}] })) };
  const reminders = { listForRundown: vi.fn(async () => []) };
  const repositories = { tasks, goals, integrations, reminders };
  const result = await reminderDeliveryBody(reminder, repositories, now);
  expect(result).toContain("Newly added homework"); expect(result).toContain("Changed appointment");
  expect(tasks.list).toHaveBeenCalledWith("person-a", "open");
  expect(integrations.agenda).toHaveBeenCalledWith("person-a", "2026-10-05T07:00:00.000Z", "2026-10-06T07:00:00.000Z");
  tasks.list.mockResolvedValue([]);
  expect(await reminderDeliveryBody(reminder, repositories, now)).not.toContain("Newly added homework");
});
it("keeps ordinary reminders literal and discloses unavailable Calendar rather than claiming a free day", async () => {
  const repositories = {tasks:{list:vi.fn(async()=>[])},goals:{list:vi.fn(async()=>[])},integrations:{agenda:vi.fn(async()=>{throw new Error("offline")})}};
  expect(await reminderDeliveryBody({...reminder,contentMode:"text"},repositories,now)).toBe("Reminder: My daily plan");
  expect(repositories.tasks.list).not.toHaveBeenCalled();
  expect(await reminderDeliveryBody(reminder,repositories,now)).toMatch(/calendar.*(?:unavailable|could not|couldn.t)/i);
});

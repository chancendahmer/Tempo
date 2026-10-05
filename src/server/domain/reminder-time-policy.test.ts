import { expect, it } from "vitest";
import { reminderTimeIssue } from "./reminder-time-policy";

const now = new Date("2026-10-05T18:00:00Z"), timezone = "America/New_York";
const history = [
  { id: "request", role: "user" as const, content: "Give me a morning reminder tomorrow to do homework", createdAt: now },
  { id: "reply", role: "assistant" as const, replyToMessageId: "request", content: "What time would you like?", createdAt: now },
];

it("does not apply the previous request's morning or date constraint to a new explicit subject", () => {
  expect(reminderTimeIssue({ type: "create_reminder", text: "Stretch", remindAt: "2026-10-05T18:02:00Z" },
    { now, timezone, history, message: "Remind me in two minutes to stretch", inheritSchedule: false })).toBeUndefined();
});

it("keeps tomorrow while accepting a short 11am answer, and rejects a different day", () => {
  const input = { now, timezone, history, message: "11am?", inheritSchedule: true };
  expect(reminderTimeIssue({ type: "create_reminder", text: "Homework", remindAt: "2026-10-06T11:00:00-04:00" }, input)).toBeUndefined();
  expect(reminderTimeIssue({ type: "create_reminder", text: "Homework", remindAt: "2026-10-07T11:00:00-04:00" }, input)).toMatch(/day does not match/);
});

it("uses the target time of a move rather than accepting the old time", () => {
  const input = { now, timezone, message: "Move my Monday and Tuesday reminders from 5pm to 12pm" };
  const command = { type: "reschedule_reminders" as const, changes: [5,6].map(day => ({ reminderId: `reminder-${day}`, expectedRemindAt: `2026-10-0${day}T17:00:00-04:00`, remindAt: `2026-10-0${day}T17:00:00-04:00` })) };
  expect(reminderTimeIssue(command, input)).toMatch(/time does not match/);
  expect(reminderTimeIssue({ ...command, changes: command.changes.map(item => ({ ...item, remindAt: item.remindAt.replace("T17", "T12") })) }, input)).toBeUndefined();
});

it("asks for a simpler batch rather than silently swapping day/time pairings", () => {
  expect(reminderTimeIssue({ type: "create_reminders", reminders: [
    { text: "Library", remindAt: "2026-10-07T17:00:00-04:00" },
    { text: "Library", remindAt: "2026-10-08T14:00:00-04:00" },
  ] }, { now, timezone, message: "Remind me to call the library Wednesday at 2pm and Thursday at 5pm" })).toMatch(/Nothing was added/);
});

it("allows ordered same-day batch time edits but rejects swapped assignments", () => {
  const changes = [
    {reminderId:"00000000-0000-4000-8000-000000000001",expectedRemindAt:"2027-01-16T14:00:00-05:00",remindAt:"2027-01-16T15:00:00-05:00"},
    {reminderId:"00000000-0000-4000-8000-000000000002",expectedRemindAt:"2027-01-16T17:00:00-05:00",remindAt:"2027-01-16T18:00:00-05:00"},
  ];
  const input={message:"Move both charger reminders on Saturday to 3PM and 6PM",timezone:"America/New_York",now:new Date("2027-01-14T15:00:00Z")};
  expect(reminderTimeIssue({type:"reschedule_reminders",changes},input)).toBeUndefined();
  expect(reminderTimeIssue({type:"reschedule_reminders",changes:changes.map((item,i)=>({...item,remindAt:changes[1-i].remindAt}))},input)).toContain("Nothing was changed");
});

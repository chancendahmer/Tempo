import { describe, expect, it } from "vitest";
import { assertReminderProbeBefore, observeProbeAuthorizer, reminderProbeExpectationSchema, verifyReminderProbe, type ReminderProbeAction, type ReminderProbeExpectation, type ReminderProbeSnapshot } from "../../../scripts/lib/local-web-message-probe";
import type { TurnAuthorization } from "../domain/turn-write-policy";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const userId = id(1), messageId = id(2), timezone = "America/New_York", text = "Fictional Cedar QA";
const snapshot = (value: number, hour: number): ReminderProbeSnapshot => ({ id: id(value), text, remindAt: `2027-01-14T${hour + 5}:00:00.000Z`, timezone, status: "scheduled", sourceMessageId: messageId, recurrence: null, provider: null, providerMessageSid: null, sentAt: null });
const rows = [snapshot(3, 14), snapshot(4, 17)];
const action = (row: ReminderProbeSnapshot, value = 10): ReminderProbeAction => ({ id: id(value), reminderId: row.id, status: "scheduled", runAt: row.remindAt, payload: { reminderId: row.id, occurrenceAt: row.remindAt }, queueJobId: null, attempts: 0 });
const actions = rows.map((row, index) => action(row, 10 + index));
const expected: ReminderProbeExpectation = { text, count: 2, hours: [14, 17], date: "2027-01-14" };
const previous = { passed: true as const, userId, reminderProof: { text, reminders: rows } };
const creation = () => ({ userId, messageId, timezone, expected, before: [], after: rows, actions });

describe("provider-free reminder proof assertions", () => {
  it("records only returned authorization mode and commands without altering authorization", async () => {
    const trace: TurnAuthorization[] = [];
    const decision: TurnAuthorization = { mode: "write", commands: ["create_reminders"] };
    const authorizer = observeProbeAuthorizer({ authorize: async () => decision }, value => trace.push(value))!;
    expect(await authorizer.authorize({ message: "Private synthetic input never belongs in the trace" })).toBe(decision);
    decision.commands.push("life_save");
    expect(trace).toEqual([{ mode: "write", commands: ["create_reminders"] }]);
    expect(JSON.stringify(trace)).not.toContain("Private");
    expect(observeProbeAuthorizer(undefined, value => trace.push(value))).toBeUndefined();
    const denied = observeProbeAuthorizer({ authorize: async () => ({ mode: "uncertain", commands: [] }) }, value => trace.push(value))!;
    await denied.authorize({ message: "Another private synthetic input" });
    expect(trace.at(-1)).toEqual({ mode: "uncertain", commands: [] });
  });

  it("proves two exact local times and their durable undispatched actions", () => {
    const proof = verifyReminderProbe(creation());
    expect(proof.count).toBe(2);
    expect(proof.localTimes.map(time => time.hour)).toEqual([14, 17]);
    expect(proof.reminders.map(row => row.id)).toEqual(rows.map(row => row.id));
    expect(proof.identityPreserved).toBe(false);
  });

  it("rejects missing, duplicate, mismatched, or dispatched delivery jobs", () => {
    for (const invalid of [actions.slice(0, 1), [...actions, action(rows[0], 99)], [{ ...actions[0], runAt: rows[1].remindAt }, actions[1]], [{ ...actions[0], payload: { reminderId: rows[0].id, occurrenceAt: rows[1].remindAt } }, actions[1]], [{ ...actions[0], queueJobId: id(80) }, actions[1]], [{ ...actions[0], attempts: 1 }, actions[1]]]) {
      expect(() => verifyReminderProbe({ ...creation(), actions: invalid })).toThrow();
    }
  });

  it("rejects wrong counts, dates, minutes, timezones, sources, recurrence, and prior delivery", () => {
    expect(() => verifyReminderProbe({ ...creation(), after: rows.slice(0, 1), actions: actions.slice(0, 1) })).toThrow("count");
    for (const change of [
      { remindAt: "2027-01-15T19:00:00.000Z" }, { remindAt: "2027-01-14T19:30:00.000Z" }, { timezone: "UTC" },
      { sourceMessageId: id(70) }, { recurrence: "daily" }, { provider: "twilio" }, { sentAt: "2027-01-14T19:00:01.000Z" },
    ]) expect(() => verifyReminderProbe({ ...creation(), after: [{ ...rows[0], ...change }, rows[1]] })).toThrow();
  });

  it("proves an edit preserves both IDs, retires old actions, and schedules the new times", () => {
    const moved = [snapshot(3, 15), snapshot(4, 18)];
    const proof = verifyReminderProbe({ ...creation(), messageId: id(20), expected: { ...expected, hours: [15, 18], previous }, before: rows, after: moved, actions: [...actions.map(row => ({ ...row, status: "cancelled" })), ...moved.map((row, index) => action(row, 30 + index))] });
    expect(proof.identityPreserved).toBe(true);
    expect(proof.reminders.map(row => row.id)).toEqual(rows.map(row => row.id));
    expect(() => verifyReminderProbe({ ...creation(), expected: { ...expected, previous }, before: rows, after: [snapshot(9, 14), rows[1]] })).toThrow("preserve their IDs");
  });

  it("proves cancellation leaves the original rows cancelled with no active delivery action", () => {
    const cancelled = { ...creation(), messageId: id(20), expected: { text, count: 0, previous }, before: rows, after: rows.map(row => ({ ...row, status: "cancelled" as const })), actions: actions.map(row => ({ ...row, status: "cancelled" })) };
    expect(verifyReminderProbe(cancelled).count).toBe(0);
    expect(() => verifyReminderProbe({ ...cancelled, actions })).toThrow("active reminder delivery");
    expect(() => verifyReminderProbe({ ...cancelled, after: rows })).toThrow("count");
  });

  it("refuses stale, foreign, or unrelated prior proof before processing a message", () => {
    expect(() => assertReminderProbeBefore(userId, expected, rows)).toThrow("unique");
    expect(() => assertReminderProbeBefore(userId, { ...expected, previous }, [snapshot(3, 15), rows[1]])).toThrow("changed");
    expect(() => assertReminderProbeBefore(id(99), { ...expected, previous }, rows)).toThrow("this account");
    expect(() => assertReminderProbeBefore(userId, { ...expected, previous: { ...previous, reminderProof: { text: "Other marker", reminders: rows } } }, rows)).toThrow("marker");
    expect(() => reminderProbeExpectationSchema.parse({ text, count: 0 })).toThrow("previous");
    expect(() => reminderProbeExpectationSchema.parse({ text, count: 2, hours: [14] })).toThrow("match");
    expect(() => reminderProbeExpectationSchema.parse({ text, count: 2, hours: [14, 25] })).toThrow();
  });
});

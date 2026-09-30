import { describe, expect, it, vi } from "vitest";
import { ReminderRepository, executeReminderCommand, nextRecurringOccurrence, requestedReminderTime } from "./reminder-service";
import { relativeReminderTime } from "./reminder-commands";

describe("reminder service", () => {
  it("resolves two minutes and tomorrow at 11 in the user's timezone, including DST", () => {
    expect(requestedReminderTime("Remind me in two minutes to do the dishes", new Date("2026-09-15T14:00:00Z"), "America/New_York")).toBe("2026-09-15T14:02:00.000Z");
    expect(requestedReminderTime("Remind me tomorrow at 11 AM to add Davis to get home", new Date("2026-09-15T02:00:00Z"), "America/New_York")).toBe("2026-09-15T15:00:00.000Z");
    expect(requestedReminderTime("Remind me tomorrow at 11 AM to cook", new Date("2027-03-13T14:00:00Z"), "America/New_York")).toBe("2027-03-14T15:00:00.000Z");
  });
  it("resolves simple relative reminders from the inbound processing time", () => {
    const now = new Date("2026-09-03T01:25:00Z");
    expect(relativeReminderTime("Can you text me and remind me to do the dishes in 1 minute?", now))
      .toBe("2026-09-03T01:26:00.000Z");
    expect(relativeReminderTime("Remind me tomorrow at 11 AM to add Davis to get home", now)).toBeUndefined();
    expect(relativeReminderTime("Cancel my reminder in 1 minute", now)).toBeUndefined();
  });

  it("persists an exact future instant and confirms it in the user's timezone", async () => {
    const create = vi.fn(async (input: Parameters<ReminderRepository["create"]>[0]) => ({
      id: "r1", text: input.text, remindAt: input.remindAt, timezone: input.timezone,
      recurrence: input.recurrence ?? null, occurrenceCount: 0, status: "scheduled" as const,
    }));
    const repository: ReminderRepository = {
      findBySourceMessage: async () => null,
      create,
      listUpcoming: async () => [],
      listForRundown: async () => [],
      cancel: async () => ({ kind: "not_found" }),
    };
    const reply = await executeReminderCommand(repository, {
      type: "create_reminder",
      text: "submit the report",
      remindAt: "2026-08-21T22:00:00-04:00",
    }, {
      userId: "u1", sourceMessageId: "m1", timezone: "America/New_York", now: new Date("2026-08-20T12:00:00Z"),
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ remindAt: new Date("2026-08-22T02:00:00Z") }));
    expect(reply).toContain("10:00 PM EDT");
  });

  it("keeps recurring reminders at the same local time across DST and skips weekends", () => {
    expect(nextRecurringOccurrence(
      new Date("2027-03-13T14:00:00Z"),
      "America/New_York",
      "daily",
    )).toEqual(new Date("2027-03-14T13:00:00Z"));
    expect(nextRecurringOccurrence(
      new Date("2026-08-21T13:00:00Z"),
      "America/New_York",
      "weekdays",
    )).toEqual(new Date("2026-08-24T13:00:00Z"));
  });

  it("rejects a model-generated reminder instant that is already in the past", async () => {
    const repository: ReminderRepository = {
      findBySourceMessage: async () => null,
      create: vi.fn(),
      listUpcoming: async () => [],
      listForRundown: async () => [],
      cancel: async () => ({ kind: "not_found" }),
    };
    await expect(executeReminderCommand(repository, {
      type: "create_reminder", text: "past", remindAt: "2026-08-19T10:00:00-04:00",
    }, {
      userId: "u1", sourceMessageId: "m1", timezone: "America/New_York", now: new Date("2026-08-20T12:00:00Z"),
    })).resolves.toContain("already passed");
    expect(repository.create).not.toHaveBeenCalled();
  });
});

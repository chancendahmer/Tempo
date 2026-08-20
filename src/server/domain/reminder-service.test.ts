import { describe, expect, it, vi } from "vitest";
import { ReminderRepository, executeReminderCommand } from "./reminder-service";

describe("reminder service", () => {
  it("persists an exact future instant and confirms it in the user's timezone", async () => {
    const create = vi.fn(async (input: Parameters<ReminderRepository["create"]>[0]) => ({
      id: "r1", text: input.text, remindAt: input.remindAt, timezone: input.timezone, status: "scheduled" as const,
    }));
    const repository: ReminderRepository = {
      findBySourceMessage: async () => null,
      create,
      listUpcoming: async () => [],
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

  it("rejects a model-generated reminder instant that is already in the past", async () => {
    const repository: ReminderRepository = {
      findBySourceMessage: async () => null,
      create: vi.fn(),
      listUpcoming: async () => [],
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

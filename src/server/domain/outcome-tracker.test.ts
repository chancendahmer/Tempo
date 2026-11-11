import { describe, expect, it, vi } from "vitest";
import { OutcomeRepository, OutcomeTracker, classifyOutcomeReply } from "./outcome-tracker";

describe("outcome tracker", () => {
  it("keeps progress and helpfulness as separate questions", async () => {
    const record = vi.fn();
    const repository: OutcomeRepository = {
      findPending: async () => ({ interventionId: "i1", taskId: "t1", hasProgress: false, style: "direct_nudge" }),
      record,
      findRecentForTask: async () => null,
      recordTimeout: async () => undefined,
      confirmReschedule: async () => "Task",
    };
    const reply = await new OutcomeTracker(repository).tryHandleStandaloneReply({
      userId: "u1", messageId: "m1", body: "Started", now: new Date("2026-08-18T12:00:00Z"),
    });
    expect(reply).toBe("Nice. Did that nudge help, or was it the wrong nudge?");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ startedAt: expect.any(Date), helpful: undefined }));
  });

  it("treats the instructed START keyword as progress when an intervention is pending", async () => {
    const record = vi.fn();
    const repository: OutcomeRepository = {
      findPending: async () => ({ interventionId: "i1", taskId: "t1", hasProgress: false, style: "micro_start" }),
      record,
      findRecentForTask: async () => null,
      recordTimeout: async () => undefined,
      confirmReschedule: async () => "Task",
    };
    expect(await new OutcomeTracker(repository).tryHandleStandaloneReply({
      userId: "u1", messageId: "m-start", body: "START", now: new Date("2026-08-19T12:00:00Z"),
    })).toContain("Did that nudge help");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ startedAt: expect.any(Date) }));
  });

  it("classifies explicit negative feedback without guessing unrelated text", () => {
    expect(classifyOutcomeReply("wrong nudge", true)).toMatchObject({ helpful: false });
    expect(classifyOutcomeReply("No.", false)).toMatchObject({ helpful: false });
    expect(classifyOutcomeReply("That helped!", true)).toMatchObject({ helpful: true });
    expect(classifyOutcomeReply("I'm working on it.", false)).toMatchObject({ started: true, completed: false });
    expect(classifyOutcomeReply("tell me about the report", false)).toBeNull();
  });

  it.each([
    'Delete the task titled "Demo handoff". It was just a test and is no longer needed.',
    "No. Please remove the old report task.",
    "That helped. Add a task to send my notes.",
    "Remind me to start the report at 9.",
    "Move the finished report to tomorrow.",
  ])("leaves a full request on the intent path: %s", body => {
    expect(classifyOutcomeReply(body, false)).toBeNull();
    expect(classifyOutcomeReply(body, true)).toBeNull();
  });
});

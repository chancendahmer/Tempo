import { describe, expect, it, vi } from "vitest";
import { authorizationContext, hasExplicitNoWriteRequest, requestedCheckinConsent, TurnWritePolicy, type TurnAuthorization } from "./turn-write-policy";

describe("turn write policy", () => {
  it.each([
    { mode: "write", commands: ["remember_memory"], expected: true },
    { mode: "write", commands: ["create_goal"], expected: false },
    { mode: "write", commands: ["remember_memory", "create_task"], expected: false },
    { mode: "read_only", commands: [], expected: false },
    { mode: "uncertain", commands: [], expected: false },
  ] as const)("only short-circuits memory for an exclusive grant: $mode $commands", async ({ mode, commands, expected }) => {
    const authorize = vi.fn(async () => ({ mode, commands: [...commands] }));
    const policy = new TurnWritePolicy({ message: "Remember what I asked" }, { authorize });
    expect(await policy.authorizesOnly({ type: "remember_memory" })).toBe(expected);
    await policy.denial({ type: "remember_memory" });
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("never short-circuits a no-edit request or a failed classifier", async () => {
    const authorize = vi.fn(async (): Promise<TurnAuthorization> => { throw new Error("unavailable"); });
    expect(await new TurnWritePolicy({ message: "Remember pizza. Do not save anything." }, { authorize }).authorizesOnly({ type: "remember_memory" })).toBe(false);
    expect(authorize).not.toHaveBeenCalled();
    expect(await new TurnWritePolicy({ message: "Remember pizza" }, { authorize }).authorizesOnly({ type: "remember_memory" })).toBe(false);
  });

  it("caches one scoped decision for a turn, without authorizing other commands", async () => {
    const authorize = vi.fn(async (): Promise<TurnAuthorization> => ({ mode: "write", commands: ["update_task"] }));
    const policy = new TurnWritePolicy({ message: "Move my report to tomorrow" }, { authorize });
    expect(await policy.denial({ type: "list_tasks" })).toBeUndefined();
    expect(authorize).not.toHaveBeenCalled();
    expect(await policy.denial({ type: "update_task" })).toBeUndefined();
    expect(await policy.denial({ type: "life_remove" })).toContain("What change");
    expect(await policy.denial({ type: "future_tool" })).toContain("What change");
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("keeps permissions isolated between turns/accounts even with a shared authorizer", async () => {
    const authorize = vi.fn().mockResolvedValueOnce({ mode: "write", commands: ["create_task"] })
      .mockResolvedValueOnce({ mode: "read_only", commands: [] });
    const first = new TurnWritePolicy({ message: "Add a task" }, { authorize });
    const second = new TurnWritePolicy({ message: "How do tasks work?" }, { authorize });
    expect(await first.denial({ type: "create_task" })).toBeUndefined();
    expect(await second.denial({ type: "create_task" })).toContain("haven’t changed");
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it.each(["Don't change anything", "Do not save it", "Advice only", "No edits please"])("vetoes %s even with a permissive classifier", async message => {
    const authorize = vi.fn(async (): Promise<TurnAuthorization> => ({ mode: "write", commands: ["life_remove"] }));
    const policy = new TurnWritePolicy({ message }, { authorize });
    expect(hasExplicitNoWriteRequest(message)).toBe(true);
    expect(await policy.denial({ type: "life_list" })).toBeUndefined();
    expect(await policy.denial({ type: "life_remove" })).toContain("haven’t changed");
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    ["Please enable proactive check-ins twice a day.", true],
    ["Could you turn on proactive coaching?", true],
    ["I want you to disable my check-ins", false],
    ["Stop coaching", false],
    ["Please do not enable proactive check-ins", undefined],
    ["Please don't disable proactive check-ins", undefined],
    ["What happens if I enable check-ins?", undefined],
    ["Enable proactive coaching if I ask tomorrow", undefined],
    ["Please enable proactive coaching but don't actually change anything", undefined],
    ["Turn on proactive coaching and disable it", undefined],
  ])("requires unambiguous consent: %s", (message, expected) => {
    expect(requestedCheckinConsent(message)).toBe(expected);
  });

  it("sends only the latest linked exchange, without the account backlog or unsolicited reminder", () => {
    const now = new Date();
    const history = [
      { id: "old", role: "user" as const, content: "Private old context", createdAt: now },
      { id: "request", role: "user" as const, content: "Add stretch Sunday", createdAt: now },
      { id: "question", role: "assistant" as const, content: "What time?", replyToMessageId: "request", createdAt: now },
      { id: "reminder", role: "assistant" as const, content: "Take a break", createdAt: now },
    ];
    expect(authorizationContext({ message: "9 AM", history })).toEqual({ currentMessage: "9 AM", precedingExchange: { request: "Add stretch Sunday", reply: "What time?" } });
    expect(authorizationContext({ message: "9 AM", history: [...history, { id: "pivot", role: "user", content: "Let's talk about dinner", createdAt: now }] }).precedingExchange).toBeNull();
  });

  it("keeps a linked follow-up offer available to authorization, but never an orphan suggestion", () => {
    const now = new Date();
    const request = { id: "request", role: "user" as const, content: "Remind me to drink water at 3 PM", createdAt: now };
    const offer = { id: "offer", role: "assistant" as const, replyToMessageId: request.id, content: "Set for 3 PM. Want one at 5 PM too?", createdAt: now };
    const reminder = { id: "reminder", role: "assistant" as const, content: "Time for your stretch break", createdAt: now };
    expect(authorizationContext({ message: "set 5PM too", history: [request, offer, reminder] })).toEqual({
      currentMessage: "set 5PM too", precedingExchange: { request: request.content, reply: offer.content },
    });
    expect(authorizationContext({ message: "set 5PM too", history: [offer, reminder] }).precedingExchange).toBeNull();
    expect(authorizationContext({ message: "set 5PM too", history: [request, { ...offer, replyToMessageId: "another-request" }] }).precedingExchange).toBeNull();
  });
});

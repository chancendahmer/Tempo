import { expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import type { CoachingCommand } from "../adapters/llm/task-intent-parser";
import { reminders } from "../db/schema";
import { mutateWorkspace } from "../db/repositories/workspace-repository";

it.each([
  { message: "Remember that I want to run a 5K; add it to my goals.", type: "create_goal" as const, title: "Run a 5K", tab: "goals" as const },
  { message: "Remember that I need to renew my passport; put it in Tasks.", type: "create_task" as const, title: "Renew my passport", tab: "tasks" as const },
].flatMap(scenario => (["sms", "web"] as const).map(channel => ({ ...scenario, channel }))))("routes a remember-prefixed $tab request from $channel into the dashboard, not memory (scripted model)", async ({ message, type, title, tab, channel }) => {
  const authorize = vi.fn(async () => ({ mode: "write" as const, commands: [type] }));
  const parse = vi.fn(async () => ({ kind: "command" as const, command: { type, title } as CoachingCommand }));
  const simulation = await createAssistantSimulator({ authorizer: { authorize }, parse });
  try {
    const owner = await simulation.user(), other = await simulation.user();
    const turn = await owner.send(message, { channel });
    expect(parse).toHaveBeenCalledTimes(1);
    expect((await owner.workspace())[tab]).toEqual([expect.objectContaining({ title })]);
    expect((await owner.state()).memories).toHaveLength(0);
    expect((await other.workspace())[tab]).toHaveLength(0);
    await owner.send(message, { providerId: turn.providerId, channel });
    expect((await owner.workspace())[tab]).toHaveLength(1);
    expect(authorize).toHaveBeenCalledTimes(1);
  } finally { await simulation.close(); }
}, 30000);

it("recalls the current cancelled reminder and never recovers a deleted Thought from chat", async () => {
  const title = "Studio questions";
  const oldBody = "Previously saved private studio details";
  const foreignBody = "Foreign account studio details";
  const remindAt = "2027-01-12T22:00:00.000Z";
  const query = "studio questions";
  let noteId = "";
  const simulation = await createAssistantSimulator({
    authorizer: { authorize: async ({ message }) => message.startsWith("Save a thought")
      ? { mode: "write", commands: ["life_save", "create_reminder"] }
      : message.startsWith("Please delete") ? { mode: "write", commands: ["life_remove"] } : { mode: "read_only", commands: [] } },
    parse: async input => {
      if (input.message.startsWith("Save a thought")) return { kind: "command", command: {
        type: "capture_with_reminder", destination: "note", title, details: input.message.includes(foreignBody) ? foreignBody : oldBody, remindAt,
      } };
      if (input.message.startsWith("Please delete")) return { kind: "command", command: { type: "life_remove", id: noteId, version: 1 } };
      const raw = await input.execute!({ type: "recall_memories", query });
      const result = JSON.parse(raw) as { reminderSearch: { items: Array<{ text: string; status: string }> }; savedRecordsNotice: string };
      const denied = await input.execute!({ type: "life_save", data: { kind: "note", title, body: oldBody } });
      expect(denied).toMatch(/haven’t changed anything/i);
      return { kind: "conversation", reply: `${result.reminderSearch.items[0]?.text}: ${result.reminderSearch.items[0]?.status}. ${result.savedRecordsNotice}` };
    },
  });
  simulation.setTime(new Date("2027-01-11T15:00:00Z"));
  try {
    const owner = await simulation.user(), other = await simulation.user();
    await owner.send(`Save a thought titled ${title} with ${oldBody} and remind me tomorrow at 5 PM.`);
    await other.send(`Save a thought titled ${title} with ${foreignBody} and remind me tomorrow at 5 PM.`);
    const initial = await owner.workspace();
    noteId = initial.items[0].id;
    const reminderId = initial.reminders[0].id;
    await owner.send(`Please delete the ${title} thought. Keep its reminder.`, { channel: "web" });
    await mutateWorkspace(owner.id, { action: "remove_reminder", id: reminderId }, simulation.database);
    const foreignBefore = await other.state();
    const before = await owner.state();
    const checkRecall = async (channel: "sms" | "web", expectedTitle: string) => {
      const turn = await owner.send("What did I save about studio questions? Don't recreate it.", { channel });
      const raw = turn.toolTrace?.find(entry => entry.command.type === "recall_memories")?.result ?? "";
      expect(JSON.parse(raw)).toMatchObject({
        facts: [], noteSearch: { items: [] }, reminderSearch: { searched: true, truncated: false, items: [
          { text: expectedTitle, status: "cancelled", remindAt, timezone: "America/New_York", recurrence: null },
        ] },
      });
      expect(raw).not.toContain(oldBody);
      expect(raw).not.toContain(foreignBody);
      expect(turn.replies).toEqual([expect.stringContaining("cancelled")]);
      expect(turn.replies[0]).toContain("Earlier conversation messages remain separate.");
      expect(turn.replies[0]).not.toMatch(/still active|content itself is gone/i);
    };
    await checkRecall("sms", title);
    expect((await owner.state()).lifeItems).toEqual(before.lifeItems);
    expect((await owner.state()).reminders).toEqual(before.reminders);
    // A newer label can stop matching title terms. The owned source still verifies the link.
    const renamed = "Confirm class schedule";
    await simulation.database.update(reminders).set({ text: renamed }).where(and(eq(reminders.id, reminderId), eq(reminders.userId, owner.id)));
    await checkRecall("web", renamed);
    const after = await owner.state();
    expect(after.lifeItems).toHaveLength(0);
    expect(after.reminders).toHaveLength(1);
    expect(after.reminders[0]).toMatchObject({ id: reminderId, text: renamed, status: "cancelled" });
    expect(await other.state()).toEqual(foreignBefore);
    expect((await owner.workspace()).messages.some(message => message.body.includes(oldBody))).toBe(true);
  } finally { await simulation.close(); }
}, 30000);

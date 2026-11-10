import { expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { DrizzleReminderRepository } from "../db/repositories/reminder-repository";
import { LifeAssistant } from "../db/repositories/life-assistant";
import { lifeActionReceipts, scheduledActions } from "../db/schema";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import type { CoachingCommand } from "../adapters/llm/task-intent-parser";
import type { TurnAuthorization } from "../domain/turn-write-policy";
import { assistantCommandSchema } from "../domain/assistant-commands";

it.each([false, true])("anchors compound elapsed time to receipt and keeps the capture atomic when late=%s", async late => {
  const title = "Tempo main release QA";
  const details = "The blue notebook is on the demo shelf.";
  const command = { type: "capture_with_reminder", destination: "note", title, details, remindAt: "2026-11-10T23:15:00-05:00" } as const;
  const text = `Save a thought titled "${title}" saying "${details}" Also remind me in two minutes to review that thought.`;
  let advance: () => void;
  const simulation = await createAssistantSimulator({
    authorizer: { authorize: async () => ({ mode: "write", commands: ["life_save", "create_reminder"] }) },
    parse: async input => {
      advance();
      return { kind: "conversation", reply: await input.execute!(command) };
    },
  });
  try {
    simulation.setTime(new Date("2026-11-10T23:12:59.999Z"));
    advance = () => simulation.setTime(new Date(late ? "2026-11-10T23:16:00Z" : "2026-11-10T23:13:40Z"));
    const owner = await simulation.user();
    const turn = await owner.send(text);
    const state = await owner.workspace();
    if (late) {
      expect(turn.replies.join(" ")).toContain("That reminder time has passed");
      expect(state.items).toHaveLength(0);
      expect(state.reminders).toHaveLength(0);
      expect(await simulation.database.select().from(scheduledActions).where(eq(scheduledActions.kind, "deliver_reminder"))).toHaveLength(0);
      return;
    }
    const expected = new Date("2026-11-10T23:15:00Z");
    expect(state.items).toEqual([expect.objectContaining({ data: { kind: "note", title, body: details } })]);
    expect(state.reminders).toEqual([expect.objectContaining({ text: title, remindAt: expected })]);
    const [reminder] = state.reminders;
    expect(await simulation.database.select().from(scheduledActions).where(eq(scheduledActions.reminderId, reminder.id))).toEqual([
      expect.objectContaining({ kind: "deliver_reminder", status: "scheduled", runAt: expected, payload: { reminderId: reminder.id, occurrenceAt: expected.toISOString() } }),
    ]);
    expect(turn.replies.join(" ")).toContain("6:15 PM EST");
    const source = state.messages.find(row => row.direction === "inbound")!;
    const life = new LifeAssistant(simulation.database);
    const replay = await life.captureWithReminder(owner.id, source.id,
      { ...command, remindAt: "2026-11-11T00:15:00-05:00" }, new Date("2026-11-10T23:16:00Z"), "America/New_York");
    expect(replay).toContain("6:15 PM EST");
    // Simulate an older receipt that stored the original model proposal in its fingerprint.
    await simulation.database.update(lifeActionReceipts).set({ fingerprint: createHash("sha256").update(JSON.stringify(assistantCommandSchema.parse(command))).digest("hex") })
      .where(eq(lifeActionReceipts.key, `capture:${owner.id}:${source.id}`));
    await expect(life.captureWithReminder(owner.id, source.id, command, new Date("2026-11-10T23:16:00Z"), "America/New_York")).resolves.toBe(replay);
    await owner.send(text, { providerId: turn.providerId });
    expect((await owner.workspace()).reminders).toHaveLength(1);
  } finally { await simulation.close(); }
}, 30000);

it.each([false, true])("uses the same receipt clock for a standalone reminder when late=%s", async late => {
  let advance: () => void;
  const simulation = await createAssistantSimulator({
    authorizer: { authorize: async () => ({ mode: "write", commands: ["create_reminder"] }) },
    parse: async input => {
      advance();
      return { kind: "conversation", reply: await input.execute!({ type: "create_reminder", text: "Review the thought", remindAt: "2026-11-10T23:15:00-05:00" }) };
    },
  });
  try {
    simulation.setTime(new Date("2026-11-10T23:12:59.999Z"));
    advance = () => simulation.setTime(new Date(late ? "2026-11-10T23:16:00Z" : "2026-11-10T23:13:40Z"));
    const owner = await simulation.user();
    const text = "Remind me in two minutes to review the thought.";
    const turn = await owner.send(text);
    const expected = new Date("2026-11-10T23:15:00Z");
    expect(turn.replies.join(" ")).toContain(late ? "time has already passed" : "6:15 PM EST");
    expect((await owner.workspace()).reminders).toEqual(late ? [] : [expect.objectContaining({ remindAt: expected })]);
    expect(await simulation.database.select().from(scheduledActions).where(eq(scheduledActions.kind, "deliver_reminder")))
      .toEqual(late ? [] : [expect.objectContaining({ status: "scheduled", runAt: expected })]);
    await owner.send(text, { providerId: turn.providerId });
    expect((await owner.workspace()).reminders).toHaveLength(late ? 0 : 1);
  } finally { await simulation.close(); }
}, 30000);

it.each(["note", "task", "goal"] as const)("saves a %s and reminder together to the same account, once (scripted)", async destination => {
  const command = { type: "capture_with_reminder", destination, title: "Visit the innovation center", remindAt: "2026-10-07T12:00:00-04:00" } as unknown as CoachingCommand;
  const commands: TurnAuthorization["commands"] = [destination === "note" ? "life_save" : destination === "goal" ? "create_goal" : "create_task", "create_reminder"];
  const simulation = await createAssistantSimulator({ authorizer: { authorize: async () => ({ mode: "write", commands }) }, parse: async () => ({kind:"command", command}) });
  try {
    simulation.setTime(new Date("2026-10-07T00:44:00Z"));
    const owner = await simulation.user(), other = await simulation.user();
    const message = `Add "Visit the innovation center" to my ${destination} and remind me tomorrow at noon`;
    const turn = await owner.send(message);
    const state = await owner.workspace();
    expect(destination === "note" ? state.items : destination === "goal" ? state.goals : state.tasks).toHaveLength(1);
    expect(state.reminders).toEqual([expect.objectContaining({text: "Visit the innovation center", remindAt: new Date("2026-10-07T16:00:00Z")})]);
    expect(turn.replies.join(" ")).toContain("Reminder set");
    expect(turn.replies.join(" ")).toContain(`Saved to ${{ note: "Thoughts", task: "To-do", goal: "Goals" }[destination]}:`);
    expect((await other.workspace()).reminders).toHaveLength(0);
    const sourceId = state.messages.find(row => row.direction === "inbound")!.id;
    const life = new LifeAssistant(simulation.database);
    const capture = {type: "capture_with_reminder" as const, destination, title: "Visit the innovation center", remindAt: "2026-10-07T12:00:00-04:00"};
    // A resumed executor returns its receipt even after the reminder time passed.
    expect(await life.captureWithReminder(owner.id, sourceId, capture, new Date("2026-10-08T18:00:00Z"), "America/New_York")).toContain("Reminder set");
    await expect(life.captureWithReminder(other.id, sourceId, capture, new Date("2026-10-06T18:00:00Z"), "America/New_York")).rejects.toThrow("Invalid capture source");
    await expect(life.captureWithReminder(owner.id, sourceId, {...capture, title: "Different request"}, new Date("2026-10-06T18:00:00Z"), "America/New_York")).rejects.toThrow("replay differs");
    await owner.send(message, {providerId: turn.providerId});
    expect((await owner.workspace()).reminders).toHaveLength(1);
  } finally { await simulation.close(); }
}, 30000);

it.each(["note", "task", "goal"] as const)("rolls back the %s if reminder persistence fails", async destination => {
  const simulation = await createAssistantSimulator({authorizer: {authorize: async () => ({mode: "write", commands: [destination === "note" ? "life_save" : destination === "goal" ? "create_goal" : "create_task", "create_reminder"]})},
    parse: async () => ({kind: "command", command: {type: "capture_with_reminder", destination, title: "Library visit", remindAt: "2026-10-07T16:00:00Z"}})});
  const failure = vi.spyOn(DrizzleReminderRepository.prototype, "create").mockRejectedValue(new Error("Injected storage failure"));
  try {
    simulation.setTime(new Date("2026-10-06T18:00:00Z"));
    const user = await simulation.user();
    await expect(user.send(`Add Library visit to my ${destination} and remind me tomorrow at noon`)).rejects.toThrow("Injected storage failure");
    const state = await user.workspace();
    expect(state.items).toHaveLength(0); expect(state.tasks).toHaveLength(0); expect(state.goals).toHaveLength(0); expect(state.reminders).toHaveLength(0);
  } finally {failure.mockRestore(); await simulation.close();}
}, 30000);

it.each(([ ["life_save"], ["create_reminder"], [] ] as TurnAuthorization["commands"][]).map(commands => ({commands})))("never adds an unrequested half of a compound capture: %j", async ({commands}) => {
  const simulation = await createAssistantSimulator({authorizer: {authorize: async () => ({mode: commands.length ? "write" : "read_only", commands})}, parse: async () => ({kind:"command", command: {type:"capture_with_reminder", destination:"note", title:"Library", remindAt:"2026-10-07T16:00:00Z"} as unknown as CoachingCommand})});
  try {
    simulation.setTime(new Date("2026-10-06T18:00:00Z"));
    const user = await simulation.user();
    await user.send("Could you save Library?");
    const state = await user.workspace();
    expect(state.items).toHaveLength(0); expect(state.reminders).toHaveLength(0);
  } finally { await simulation.close(); }
}, 30000);

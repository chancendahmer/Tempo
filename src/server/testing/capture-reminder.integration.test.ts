import { expect, it, vi } from "vitest";
import { DrizzleReminderRepository } from "../db/repositories/reminder-repository";
import { LifeAssistant } from "../db/repositories/life-assistant";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import type { CoachingCommand } from "../adapters/llm/task-intent-parser";
import type { TurnAuthorization } from "../domain/turn-write-policy";

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

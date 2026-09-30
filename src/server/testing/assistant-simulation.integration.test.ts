import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAssistantSimulator, type AssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { assistantScenarios, scriptedScenarioParser } from "../../../scripts/lib/assistant-scenarios";
import { tasks, goals, reminders } from "../db/schema";

describe("captured SMS acceptance conversations (scripted model; real repositories)", () => {
  let simulation: AssistantSimulator;
  beforeAll(async () => {
    simulation = await createAssistantSimulator(scriptedScenarioParser);
    simulation.setTime(new Date("2027-01-14T15:00:00Z"));
  }, 30_000);
  afterAll(async () => simulation?.close());

  it("returns the same account-scoped rundown through SMS and web without model calls or mutations", async () => {
    const owner = await simulation.user();
    const outsider = await simulation.user();
    await simulation.database.insert(tasks).values([
      { userId: owner.id, title: "Prepare demo", dueAt: new Date("2027-01-15T18:00:00Z") },
      { userId: outsider.id, title: "PRIVATE OTHER TASK" },
    ]);
    await simulation.database.insert(goals).values([
      { userId: owner.id, title: "Build confidence" }, { userId: outsider.id, title: "PRIVATE OTHER GOAL" },
    ]);
    await simulation.database.insert(reminders).values([
      { userId: owner.id, text: "Pack lunch", remindAt: new Date("2027-01-15T14:00:00Z"), timezone: "America/New_York", idempotencyKey: `rundown-${owner.id}` },
      { userId: outsider.id, text: "PRIVATE OTHER REMINDER", remindAt: new Date("2027-01-15T14:00:00Z"), timezone: "America/New_York", idempotencyKey: `rundown-${outsider.id}` },
      { userId: owner.id, text: "CANCELLED REMINDER", status: "cancelled", remindAt: new Date("2027-01-15T14:00:00Z"), timezone: "America/New_York", idempotencyKey: `cancelled-${owner.id}` },
    ]);
    const before = await owner.state();
    const otherBefore = await outsider.state();
    const sms = await owner.send("Weekly rundown for 2027-01-11");
    const web = await owner.send("Weekly rundown for 2027-01-11", { channel: "web" });
    expect(sms.parserCalled).toBe(false);
    expect(web.parserCalled).toBe(false);
    expect(web.replies).toEqual(sms.replies);
    for (const title of ["Prepare demo", "Build confidence", "Pack lunch", "Dentist"]) expect(sms.replies[0]).toContain(title);
    expect(sms.replies[0]).not.toMatch(/PRIVATE OTHER|CANCELLED REMINDER/);
    const after = await owner.state();
    expect(after.tasks).toEqual(before.tasks);
    expect(after.reminders).toEqual(before.reminders);
    expect(after.calendarWrites).toEqual([]);
    expect(await outsider.state()).toEqual(otherBefore);
    expect((await owner.send("Weekly rundown for 2027-01-11", { providerId: sms.providerId })).duplicate).toBe(true);
  });

  it("stores dessert preferences, forgets only yogurt, and declines secrets", async () => {
    const user = await simulation.user();
    const question = await user.send("Can you remember my favorite foods?");
    expect(question.replies[0]).toContain("What’s one food");
    expect((await user.state()).memories).toHaveLength(0);
    const saved = await user.send("I really like frozen blueberries and yogurt as a dessert.");
    expect(saved.replies[0]).toContain("Added to your favorite-food list");
    expect(saved.parserCalled).toBe(false);
    await user.send("Forget yogurt.");
    expect((await user.state()).memories.map((item) => item.content)).toEqual(["Favorite food: frozen blueberries."]);
    const secret = await user.send("Remember my password is fake-test-secret.");
    expect(secret.replies[0]).toContain("can’t save secrets");
    expect((await user.state()).memories).toHaveLength(1);
  });

  it("creates, moves, completes and cancels reminders without creating tasks", async () => {
    const user = await simulation.user();
    for (const label of ["relative reminder", "tomorrow reminder", "reschedule reminder", "complete reminder", "cancel reminder"]) {
      const scenario = assistantScenarios.find((item) => item.label === label)!;
      const turn = await user.send(scenario.message);
      expect(turn.replies).toHaveLength(1);
    }
    const state = await user.state();
    expect(state.tasks).toHaveLength(0);
    expect(state.reminders.find((item) => /dishes/.test(item.text))).toMatchObject({ status: "completed", remindAt: new Date("2027-01-15T16:00:00Z") });
    expect(state.reminders.find((item) => /Davis/.test(item.text))).toMatchObject({ status: "cancelled" });
  });

  it("keeps new questions independent of old reminders and suppresses an old webhook replay", async () => {
    const user = await simulation.user();
    const first = await user.send("Remind me in 2 minutes to do the dishes.");
    for (const message of ["Hello", "Who are you?", "That’s not what I said to do."]) {
      const reply = await user.send(message);
      expect(reply.replies[0]).not.toMatch(/Reminder set|dishes/i);
    }
    const repeated = await user.send(first.input, { providerId: first.providerId });
    expect(repeated).toMatchObject({ duplicate: true, replies: [], parserCalled: false });
    expect((await user.state()).reminders).toHaveLength(1);
    expect((await user.send("Hello", { mediaUrl: "invalid" })).replies).toHaveLength(1);
  });

  it("NO and expired YES never apply a calendar proposal; YES applies once", async () => {
    const user = await simulation.user();
    const proposal = assistantScenarios.find((item) => item.label === "calendar proposal")!.message;
    await user.send(proposal);
    await user.send("NO");
    expect((await user.state()).calendarWrites).toHaveLength(0);
    await user.send(proposal);
    simulation.setTime(new Date("2027-01-14T15:16:00Z"));
    await user.send("YES");
    expect((await user.state()).calendarWrites).toHaveLength(0);
    await user.send(proposal);
    const confirmed = await user.send("YES");
    expect(confirmed.replies[0]).toContain("Confirmed calendar");
    await user.send("YES", { providerId: confirmed.providerId });
    expect((await user.state()).calendarWrites).toHaveLength(1);
  });

  it("a new food preference interrupts an old calendar confirmation", async () => {
    const user = await simulation.user();
    await user.send(assistantScenarios.find((item) => item.label === "calendar proposal")!.message);
    const food = await user.send("I really like frozen blueberries and yogurt as a dessert.");
    expect(food.replies[0]).toContain("favorite-food list");
    await user.send("YES");
    expect((await user.state()).calendarWrites).toHaveLength(0);
  });

  it("isolates twenty simultaneous synthetic users and replayed webhooks", async () => {
    const people = [];
    for (let index = 0; index < 20; index += 1) people.push(await simulation.user());
    await Promise.all(people.map(async (person, index) => {
      const message = `Remember that my preferred project name is project-${index}`;
      const first = await person.send(message);
      expect(first.replies).toHaveLength(1);
      expect((await person.send(message, { providerId: first.providerId })).replies).toHaveLength(0);
      const state = await person.state();
      expect(state.memories.map((item) => item.content)).toEqual([`The user said: my preferred project name is project-${index}.`]);
      expect(state.user.proactiveOptIn).toBe(false);
    }));
  }, 30_000);

  it("processes STOP through ingestion and suppresses application replies afterward", async () => {
    const user = await simulation.user();
    const stop = await user.send("STOP");
    expect(stop).toMatchObject({ replies: [], parserCalled: false });
    expect((await user.state()).user.status).toBe("opted_out");
    expect((await user.send("Hello")).replies).toEqual([]);
  });
});

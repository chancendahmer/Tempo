import { expect, it, vi } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { prepareReleaseExtraJourney, prepareReleaseTargetJourney, type ReleaseExtraStep } from "../../../scripts/lib/release-extra-journey";
import { workspaceProductState } from "../../../scripts/lib/workspace-evaluation";

it("runs all release state assertions through isolated repositories with scripted decisions and no network", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in scripted QA"));
  let steps: ReleaseExtraStep[] = [];
  const sim = await createAssistantSimulator({ parse: async input => {
    const step = steps.find(step => step.message === input.message);
    if (!step) throw new Error("Missing scripted release fixture");
    return step.scripted(input);
  } });
  sim.setTime(new Date("2027-01-14T15:00:00Z"));
  try {
    const person = await sim.user(), outsider = await sim.user();
    steps = await prepareReleaseExtraJourney(sim, person);
    expect(steps).toHaveLength(12);
    const otherBefore = workspaceProductState(await outsider.workspace());
    for (const step of steps) {
      const before = await person.workspace();
      const turn = await person.send(step.message, { channel: step.channel });
      const after = await person.workspace(), state = await person.state();
      expect(step.assertRelease({ before, after, state, turn }), step.message).toEqual([]);
      expect(workspaceProductState(await outsider.workspace())).toEqual(otherBefore);
      const replay = await person.send(step.message, { channel: step.channel, providerId: turn.providerId });
      expect(replay).toMatchObject({ duplicate: true, parserCalled: false, replies: [] });
      expect(workspaceProductState(await person.workspace())).toEqual(workspaceProductState(after));
      if (step === steps[0]) {
        const incorrect = structuredClone(after);
        const rice = incorrect.items.find(item => item.data.kind === "grocery" && item.data.unit === "g")!;
        if (rice.data.kind !== "grocery") throw new Error("Expected rice grocery");
        rice.data.quantity = 999;
        expect(step.assertRelease({ before, after: incorrect, state, turn })).toContain("Expected one generated rice row: 500 g from 2 meal source(s).");
      }
    }
    expect(network).not.toHaveBeenCalled();
  } finally { await sim.close(); network.mockRestore(); }
}, 30000);

it("uses the injected assistant day for completed workout creates and edits while rejecting tomorrow", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in scripted QA"));
  let workoutId = "";
  const data = { kind: "workout" as const, title: "Completed walk", date: "2027-01-14", minutes: 18, activity: "Walk" as const };
  const sim = await createAssistantSimulator({ parse: async input => ({ kind: "command", command:
    input.message === "Log my completed walk today" ? { type: "life_save", data }
      : input.message === "Log my completed walk tomorrow" ? { type: "life_save", data: { ...data, date: "2027-01-15" } }
        : { type: "life_patch", id: workoutId, version: 1, patch: input.message === "Move my completed walk to tomorrow"
          ? { kind: "workout", date: "2027-01-15" } : { kind: "workout", minutes: 19 } },
  }) });
  sim.setTime(new Date("2027-01-14T15:00:00Z"));
  try {
    const person = await sim.user();
    const saved = await person.send("Log my completed walk today");
    expect(saved.replies.join(" ")).toContain("Saved");
    let rows = (await person.state()).lifeItems;
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toEqual(data);
    workoutId = rows[0].id;
    expect((await person.send("Log my completed walk tomorrow", { channel: "web" })).replies.join(" ")).toContain("today or an earlier date");
    expect((await person.send("Move my completed walk to tomorrow")).replies.join(" ")).toContain("today or an earlier date");
    rows = (await person.state()).lifeItems;
    expect(rows).toEqual([expect.objectContaining({ id: workoutId, version: 1, data })]);
    expect((await person.send("Change my completed walk to nineteen minutes", { channel: "web" })).replies.join(" ")).toContain("Updated");
    expect((await person.state()).lifeItems).toEqual([expect.objectContaining({ id: workoutId, version: 2, data: { ...data, minutes: 19 } })]);
    expect(network).not.toHaveBeenCalled();
  } finally { await sim.close(); network.mockRestore(); }
}, 30000);

it.each([false, true])("runs only target creation/retrieval and optional correction without network (correction=%s)", async correction => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in scripted QA"));
  let steps: ReleaseExtraStep[] = [];
  const sim = await createAssistantSimulator({ parse: async input => steps.find(step => step.message === input.message)!.scripted(input) });
  sim.setTime(new Date("2027-01-14T15:00:00Z"));
  try {
    const person = await sim.user(), outsider = await sim.user();
    steps = await prepareReleaseTargetJourney(sim, person, correction);
    expect(steps).toHaveLength(correction ? 3 : 2);
    const otherBefore = workspaceProductState(await outsider.workspace());
    for (const step of steps) {
      const before = await person.workspace(), turn = await person.send(step.message, { channel: step.channel });
      const after = await person.workspace(), state = await person.state();
      expect(step.assertRelease({ before, after, state, turn }), step.message).toEqual([]);
      expect(workspaceProductState(await outsider.workspace())).toEqual(otherBefore);
      const retry = await person.send(step.message, { channel: step.channel, providerId: turn.providerId });
      expect(retry).toMatchObject({ duplicate: true, parserCalled: false, replies: [] });
      expect(workspaceProductState(await person.workspace())).toEqual(workspaceProductState(after));
      if (correction && step === steps[2]) {
        const wrong = structuredClone(after), target = wrong.items.find(row => row.data.kind === "nutrition_target")!;
        if (target.data.kind !== "nutrition_target") throw new Error("Missing target fixture");
        target.data.calories = 2100;
        expect(step.assertRelease({ before, after: wrong, state, turn })).toContain("Target correction replaced the record or changed unrelated target fields.");
      }
    }
    expect(network).not.toHaveBeenCalled();
  } finally { await sim.close(); network.mockRestore(); }
}, 30000);

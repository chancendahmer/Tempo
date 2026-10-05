import { expect, it } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";

it("recalls account-owned notes across channels using separated search words (scripted parser)", async () => {
  const simulation = await createAssistantSimulator({ parse: async input => {
    if (input.message.startsWith("Save note")) return { kind: "command", command: { type: "life_save", data: { kind: "note", title: "Spare apartment keys location", body: input.message.includes("neighbor") ? "Neighbor's private hiding place" : "My spare apartment keys are in the blue bowl by the door." } } };
    return { kind: "command", command: { type: "recall_memories", query: "spare keys" } };
  } });
  try {
    const owner = await simulation.user(), other = await simulation.user(), empty = await simulation.user();
    await owner.send("Save note: spare apartment keys are in the blue bowl by the door.", { channel: "web" });
    await other.send("Save note: neighbor spare apartment keys.");
    const reply = (await owner.send("Where did I leave my spare keys?")).replies.join(" ");
    expect(reply).toContain("blue bowl");
    expect(reply).not.toContain("Neighbor's private hiding place");
    expect(reply).toContain("factsCoverage");
    const noMatch = (await empty.send("Where did I leave my spare keys?")).replies.join(" ");
    expect(noMatch).not.toContain("blue bowl");
    expect(noMatch).not.toContain("Neighbor's private hiding place");
  } finally { await simulation.close(); }
}, 30000);

it("routes an SMS recipe request to the structured library, then retrieves it without inventing a task (scripted parser)", async () => {
  const simulation = await createAssistantSimulator({ parse: async input => {
    if (/remember/i.test(input.message)) return { kind: "command", command: { type: "life_save", data: { kind: "recipe", title: "Lemon rice", ingredients: "Rice\nLemon", instructions: "Cook rice and add lemon.", servings: 2, prepMinutes: 20, favorite: true } } };
    return { kind: "command", command: { type: "life_list", kind: "recipe" } };
  } });
  try {
    const user = await simulation.user();
    const reply = await user.send("Remember this recipe: lemon rice, rice and lemon, cook rice and add lemon, 20 minutes, serves 2.");
    expect(reply.replies.join(" ")).toContain("Saved");
    const state = await user.state();
    expect(state.lifeItems).toHaveLength(1);
    expect(state.lifeItems[0].data.kind).toBe("recipe");
    expect(state.tasks).toHaveLength(0);
    expect(state.memories).toHaveLength(0);
    expect((await user.send("Show my saved recipes")).replies.join(" ")).toContain("Lemon rice");
    const other = await simulation.user();
    expect((await other.send("Show my saved recipes")).replies.join(" ")).not.toContain("Lemon rice");
  } finally { await simulation.close(); }
}, 30000);


it("routes dinner rescheduling through the meal record instead of task shortcuts (scripted parser)", async () => {
  let recordId = "";
  const meal = { kind: "meal" as const, title: "Rice bowl", date: "2026-09-28", meal: "Dinner" as const, ingredients: "Rice and beans" };
  const simulation = await createAssistantSimulator({ parse: async input => ({ kind: "command", command: recordId
    ? { type: "life_patch", id: recordId, version: 1, patch: { kind: "meal", date: /tomorrow/i.test(input.message) ? "2026-09-29" : meal.date } }
    : { type: "life_save", data: meal } }) });
  try {
    const user = await simulation.user();
    await user.send("Plan rice bowl for dinner on September 28");
    recordId = (await user.state()).lifeItems[0].id;
    await user.send("Move dinner to tomorrow");
    const state = await user.state();
    expect(state.tasks).toHaveLength(0);
    expect(state.lifeItems).toHaveLength(1);
    expect(state.lifeItems[0].data).toEqual({ ...meal, date: "2026-09-29" });
  } finally { await simulation.close(); }
}, 30000);

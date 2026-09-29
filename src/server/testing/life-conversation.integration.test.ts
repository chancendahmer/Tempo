import { expect, it } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";

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
  const simulation = await createAssistantSimulator({ parse: async input => ({ kind: "command", command: { type: "life_save", ...(recordId ? { id: recordId, version: 1 } : {}), data: { ...meal, date: /tomorrow/i.test(input.message) ? "2026-09-29" : meal.date } } }) });
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

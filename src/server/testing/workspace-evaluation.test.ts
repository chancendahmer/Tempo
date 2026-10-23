import { expect, it } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { scriptedWorkspaceParser, workspaceJourney } from "../../../scripts/lib/workspace-journey";
import { evaluateWorkspaceChange } from "../../../scripts/lib/workspace-evaluation";

it("rejects superficially successful AI edits that also corrupt unrelated dashboard data", async () => {
  const simulation = await createAssistantSimulator(scriptedWorkspaceParser);
  try {
    const person = await simulation.user();
    await person.send(workspaceJourney[0].message);
    const before = await person.workspace();
    await person.send(workspaceJourney[1].message, { channel: "web" });
    const after = await person.workspace();
    expect(evaluateWorkspaceChange(workspaceJourney[1], before, after)).toEqual([]);
    const changed = structuredClone(after);
    const recipe = changed.items[0].data;
    if (recipe.kind !== "recipe") throw new Error("Expected recipe");
    recipe.instructions = "Unrequested replacement";
    // The old success predicate passes; the new evaluator must reject it.
    expect(workspaceJourney[1].verify(changed)).toBe(true);
    expect(evaluateWorkspaceChange(workspaceJourney[1], before, changed)).toContain("Edit failed to preserve the item identity or unrelated fields.");
    const duplicated = { ...after, items: [...after.items, { ...after.items[0], id: "extra-record" }] };
    expect(evaluateWorkspaceChange(workspaceJourney[1], before, duplicated)).not.toEqual([]);
    const changedProfile = { ...after, profile: { ...after.profile, proactiveOptIn: !after.profile.proactiveOptIn } };
    expect(evaluateWorkspaceChange(workspaceJourney[1], before, changedProfile)).toContain("Unexpected profile changes.");
    expect(evaluateWorkspaceChange(workspaceJourney.at(-1)!, before, after)).toContain("Unexpected life-item changes.");
  } finally { await simulation.close(); }
}, 30000);

it("accepts expected meal grocery side effects while detecting missing or unrelated shopping changes", async () => {
  const simulation = await createAssistantSimulator(scriptedWorkspaceParser);
  try {
    const person = await simulation.user();
    const before = await person.workspace();
    await person.send(workspaceJourney[2].message);
    const after = await person.workspace();
    expect(evaluateWorkspaceChange(workspaceJourney[2], before, after)).toEqual([]);
    const missing = { ...after, items: after.items.filter(item => item.data.kind !== "grocery") };
    expect(evaluateWorkspaceChange(workspaceJourney[2], before, missing)).toContain("Meal groceries did not match the saved ingredients and explicit pantry stock.");
    const extra = { ...after, items: [...after.items, { id: "manual-extra", version: 1, data: { kind: "grocery" as const, title: "Unrequested", checked: false } }] };
    expect(evaluateWorkspaceChange(workspaceJourney[2], before, extra)).toContain("Create changed extra or incorrect life items.");
  } finally { await simulation.close(); }
}, 30000);

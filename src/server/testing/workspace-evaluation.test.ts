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

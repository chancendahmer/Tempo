import { expect, it, vi } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import type { CoachingCommand } from "../adapters/llm/task-intent-parser";

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

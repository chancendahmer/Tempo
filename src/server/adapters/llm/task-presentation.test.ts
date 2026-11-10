import { beforeEach, describe, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("../../config/env", () => ({ requireEnv: () => ({ AI_BUDGET_MODE: "off", ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "test-model" }) }));
import { suggestTaskPresentations } from "./task-presentation";
const id = "00000000-0000-4000-8000-000000000001";
const input = [{ id, title: "Write a report about food", estimatedMinutes: null }];
const reply = (tasks: unknown[]) => ({ usage: { input_tokens: 100, output_tokens: 50 }, model: "test-model", content: [{ type: "tool_use", name: "task_presentation", input: { tasks } }] });
beforeEach(() => create.mockReset());
describe("bounded task presentation adapter", () => {
  it("supplies only task titles and estimates, with a forced schema tool", async () => {
    create.mockResolvedValue(reply([{ id, category: "work", focusMinutes: 10 }]));
    expect(await suggestTaskPresentations(input)).toEqual({ tasks: [{ id, category: "work", focusMinutes: 10 }] });
    const request = create.mock.calls[0][0];
    expect(JSON.parse(request.messages[0].content)).toEqual(input);
    expect(request.tool_choice).toEqual({ type: "tool", name: "task_presentation" });
    expect(request.max_tokens).toBe(650);
  });
  it.each([
    [{ id, category: "work", focusMinutes: 600 }],
    [{ id, category: "unknown", focusMinutes: 10 }],
    [{ id, category: "work", focusMinutes: 10, action: "delete" }],
    [{ id: "00000000-0000-4000-8000-000000000002", category: "work", focusMinutes: 10 }],
    [],
    [{ id, category: "work", focusMinutes: 10 }, { id, category: "work", focusMinutes: 10 }],
  ])("rejects invalid or mismatched model output %j", async (...tasks) => {
    create.mockResolvedValue(reply(tasks));
    await expect(suggestTaskPresentations(input)).rejects.toThrow();
  });
});

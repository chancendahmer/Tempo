import { beforeEach, expect, it, vi } from "vitest";
import { AnthropicInterventionComposer } from "./intervention-composer";
import { fallbackIntervention, type InterventionComposer } from "../../domain/intervention-strategy";

const { create, construct } = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor(options: unknown) { construct(options); } messages = { create }; } }));
vi.mock("../../config/env", () => ({ requireEnv: () => ({ ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "fixture-model" }) }));
const input: Parameters<InterventionComposer["compose"]>[0] = { style: "micro_start", taskTitle: "Write outline", freeMinutes: 30, tone: "balanced", memories: [] };
beforeEach(() => vi.clearAllMocks());

it.each(["APIConnectionTimeoutError", "RateLimitError"])("uses the validated deterministic fallback after %s without a second application call", async name => {
  create.mockRejectedValue(Object.assign(new Error("Synthetic provider failure"), { name }));
  expect(await new AnthropicInterventionComposer().compose(input)).toBe(fallbackIntervention(input));
  expect(construct).toHaveBeenCalledWith({ apiKey: "test-only", timeout: 15_000, maxRetries: 0 });
  expect(create).toHaveBeenCalledTimes(1);
});

it("also validates unsafe model output and keeps successful composition unchanged", async () => {
  create.mockResolvedValueOnce({ content: [{ type: "text", text: "No excuses, lazy!" }] })
    .mockResolvedValueOnce({ content: [{ type: "text", text: "Open the outline and write one sentence." }] });
  const composer = new AnthropicInterventionComposer();
  expect(await composer.compose(input)).toBe(fallbackIntervention(input));
  expect(await composer.compose(input)).toBe("Open the outline and write one sentence.");
  expect(construct).toHaveBeenCalledTimes(1);
});

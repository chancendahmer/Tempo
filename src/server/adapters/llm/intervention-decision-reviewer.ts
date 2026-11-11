import { invokePaidMessage, AiBudgetDeniedError } from "./paid-invocation";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { requireEnv } from "../../config/env";
import { InterventionDecisionReviewer } from "../../domain/context-evaluation-service";

const reviewTool: Tool = {
  name: "review_intervention",
  description: "Return the final bounded judgment for this proactive intervention candidate.",
  input_schema: {
    type: "object",
    properties: {
      send: { type: "boolean" },
      reason: { type: "string", maxLength: 240 },
    },
    required: ["send", "reason"],
    additionalProperties: false,
  },
};

const decisionSchema = z.object({
  send: z.boolean(),
  reason: z.string().trim().min(1).max(240),
}).strict();

export class AnthropicInterventionDecisionReviewer implements InterventionDecisionReviewer {
  private client: Anthropic | undefined;

  async review(input: Parameters<InterventionDecisionReviewer["review"]>[0]) {
    try {
      const env = requireEnv(["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]);
      this.client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY!, timeout: 15_000, maxRetries: 0 });
      const response = await invokePaidMessage(this.client, {
        model: env.ANTHROPIC_MODEL!,
        max_tokens: 160,
        system: [
          "You are Tempo's final safety-and-relevance reviewer for proactive coaching texts.",
          "The deterministic engine already enforced consent, quiet hours, calendar-busy state, cooldown, daily cap, and pending-response gates.",
          "Approve only when the selected task is concrete and the available time makes a nudge plausibly useful. Veto weak, stale, contradictory, intrusive, or low-confidence context.",
          "Do not invent calendar details, health facts, urgency, or user intent. Use the review_intervention tool exactly once.",
        ].join("\n"),
        messages: [{
          role: "user",
          content: JSON.stringify({
            now: input.now.toISOString(),
            score: input.evaluation.score,
            threshold: input.policy.threshold,
            scoreBreakdown: input.evaluation.scoreBreakdown,
            task: input.evaluation.task,
            timezone: input.signals.timezone,
            freeMinutes: input.signals.freeMinutes,
            calendarAvailable: input.signals.calendarAvailable,
            nextFreeAt: input.signals.nextFreeAt,
            repeatedNonStarts: input.signals.repeatedNonStarts,
            responseRate: input.signals.responseRate,
            extensionSignals: input.signals.extensionSignals ?? [],
          }),
        }],
        tools: [reviewTool],
        tool_choice: { type: "tool", name: reviewTool.name },
      }, "intervention_review");
      const calls = response.content.filter((item) => item.type === "tool_use");
      const block = calls[0];
      const parsed = block?.type === "tool_use" && block.name === reviewTool.name
        ? decisionSchema.safeParse(block.input) : null;
      if (response.stop_reason !== "tool_use" || calls.length !== 1 || !parsed?.success) {
        return { send: false, reason: "ai_review_invalid_fail_closed", model: "deterministic-fallback" };
      }
      return { ...parsed.data, model: env.ANTHROPIC_MODEL! };
    } catch (error) {
      if (error instanceof AiBudgetDeniedError) return { send: false, reason: "ai_budget_denied", model: "deterministic-fallback" };
      return {
        send: false,
        reason: "ai_review_unavailable_fail_closed",
        model: "deterministic-fallback",
      };
    }
  }
}

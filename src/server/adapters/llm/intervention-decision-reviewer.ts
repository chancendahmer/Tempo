import Anthropic from "@anthropic-ai/sdk";
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

export class AnthropicInterventionDecisionReviewer implements InterventionDecisionReviewer {
  private client: Anthropic | undefined;

  async review(input: Parameters<InterventionDecisionReviewer["review"]>[0]) {
    const env = requireEnv(["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]);
    this.client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    try {
      const response = await this.client.messages.create({
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
      });
      const block = response.content.find((item) => item.type === "tool_use" && item.name === reviewTool.name);
      if (!block || block.type !== "tool_use") throw new Error("AI intervention review returned no decision");
      const value = block.input as { send?: unknown; reason?: unknown };
      if (typeof value.send !== "boolean" || typeof value.reason !== "string") throw new Error("AI intervention review was invalid");
      return { send: value.send, reason: value.reason.slice(0, 240), model: env.ANTHROPIC_MODEL! };
    } catch {
      const margin = input.evaluation.score - input.policy.threshold;
      return {
        send: margin >= 0.15,
        reason: margin >= 0.15 ? "deterministic_high_confidence_fallback" : "ai_review_unavailable_fail_closed",
        model: "deterministic-fallback",
      };
    }
  }
}

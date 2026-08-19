import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { requireEnv } from "../../config/env";
import { fallbackIntervention, InterventionComposer, validateInterventionMessage } from "../../domain/intervention-strategy";

export class AnthropicInterventionComposer implements InterventionComposer {
  private client: Anthropic | undefined;

  async compose(input: Parameters<InterventionComposer["compose"]>[0]): Promise<string> {
    const env = requireEnv(["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]);
    this.client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    const messages: MessageParam[] = [{ role: "user", content: JSON.stringify(input) }];
    try {
      const response = await this.client.messages.create({
        model: env.ANTHROPIC_MODEL!,
        max_tokens: 140,
        system: [
          "Write one Tempo executive-function coaching SMS from the supplied structured context.",
          "Use the requested strategy. Be specific, warm, and low-friction. Never guilt, diagnose, moralize, or invent facts.",
          "Give exactly one concrete next action or one short choice. Stay under 320 characters. Return only the SMS text.",
        ].join("\n"),
        messages,
      });
      const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join(" ");
      return validateInterventionMessage(text);
    } catch {
      return validateInterventionMessage(fallbackIntervention(input));
    }
  }
}

export type AssistantProviderFailureCategory = "billing" | "configuration" | "transient";

/** Safe provider-failure signal that carries no provider message or credentials. */
export class AssistantProviderFailure extends Error {
  readonly name = "AssistantProviderFailure";

  constructor(readonly category: AssistantProviderFailureCategory, readonly status?: number) {
    super("Assistant provider request failed");
  }
}

export function assistantProviderFailureReply(error: unknown): string {
  if (error instanceof AssistantProviderFailure && (error.category === "billing" || error.category === "configuration")) {
    return "I can’t help with that just now because Tempo’s AI connection needs to be restored. Please try again once it’s available.";
  }
  return "I’m having trouble reaching my AI service right now. Please try that message again in a moment.";
}

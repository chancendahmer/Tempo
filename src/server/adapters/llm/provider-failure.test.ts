import { describe, expect, it } from "vitest";
import { AssistantProviderFailure, assistantProviderFailureReply } from "../../domain/assistant-provider-failure";
import { normalizeProviderFailure } from "./provider-failure";

describe("safe assistant provider failures", () => {
  it("preserves an already normalized failure", () => {
    const failure = new AssistantProviderFailure("billing", 400);
    expect(normalizeProviderFailure(failure)).toBe(failure);
  });
  it("classifies credit exhaustion without retaining provider details", () => {
    const failure = normalizeProviderFailure({ status: 400, type: "invalid_request_error", message: "credit balance is too low; key=secret-value" });
    expect(failure).toMatchObject({ category: "billing", status: 400 });
    expect(failure.message).not.toContain("secret-value");
    expect(assistantProviderFailureReply(failure)).toContain("Tempo’s AI connection needs to be restored");
    expect(assistantProviderFailureReply(failure)).not.toMatch(/try again in a moment/i);
  });

  it("keeps rate limits and service errors transient", () => {
    for (const status of [429, 503]) {
      const failure = normalizeProviderFailure({ status, message: "private provider response" });
      expect(failure.category).toBe("transient");
      expect(assistantProviderFailureReply(failure)).toMatch(/try that message again in a moment/i);
    }
  });

  it("treats invalid provider credentials as configuration failures", () => {
    expect(normalizeProviderFailure({ status: 401, message: "secret token rejected" }).category).toBe("configuration");
    expect(assistantProviderFailureReply(new AssistantProviderFailure("configuration"))).toContain("needs to be restored");
  });
});

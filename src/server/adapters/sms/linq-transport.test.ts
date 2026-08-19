import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "../../config/env";
import { LinqApiError, LinqMessagingTransport } from "./linq-transport";

const priorKey = process.env.LINQ_API_KEY;

describe("Linq messaging transport", () => {
  beforeEach(() => {
    process.env.LINQ_API_KEY = "linq-test-key";
    resetEnvCacheForTests();
  });

  afterEach(() => {
    if (priorKey === undefined) delete process.env.LINQ_API_KEY;
    else process.env.LINQ_API_KEY = priorKey;
    resetEnvCacheForTests();
  });

  it("uses managed line selection, protocol fallback, and provider idempotency", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      message: { id: "message-1", delivery_status: "queued", service: "iMessage" },
    }), { status: 202, headers: { "content-type": "application/json" } }));
    const result = await new LinqMessagingTransport(request).send({
      to: "+12025550198",
      body: "What is the smallest next step?",
      idempotencyKey: "reply:message-1",
    });

    expect(result).toEqual({
      provider: "linq",
      providerMessageSid: "message-1",
      status: "queued",
      service: "iMessage",
    });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.linqapp.com/api/partner/v3/messages");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer linq-test-key",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      to: ["+12025550198"],
      message: {
        parts: [{ type: "text", value: "What is the smallest next step?" }],
        idempotency_key: "reply:message-1",
      },
    });
  });

  it("surfaces bounded retry information without retrying ambiguously inside the adapter", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      success: false,
      error: { status: 429, code: 1007, message: "Rate limited" },
    }), { status: 429, headers: { "retry-after": "45" } }));

    const error = await new LinqMessagingTransport(request).send({
      to: "+12025550198",
      body: "Hello",
      idempotencyKey: "message-2",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LinqApiError);
    expect(error).toMatchObject({ status: 429, code: "1007", retryAfterSeconds: 45 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

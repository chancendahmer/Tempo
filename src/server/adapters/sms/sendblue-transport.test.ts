import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "../../config/env";
import { SendblueApiError, SendblueMessagingTransport } from "./sendblue-transport";

const prior = {
  key: process.env.SENDBLUE_API_KEY,
  secret: process.env.SENDBLUE_API_SECRET,
  phone: process.env.SENDBLUE_PHONE_NUMBER,
};

describe("Sendblue messaging transport", () => {
  beforeEach(() => {
    process.env.SENDBLUE_API_KEY = "sendblue-test-key";
    process.env.SENDBLUE_API_SECRET = "sendblue-test-secret";
    process.env.SENDBLUE_PHONE_NUMBER = "+12025550111";
    resetEnvCacheForTests();
  });

  afterEach(() => {
    for (const [name, value] of Object.entries({
      SENDBLUE_API_KEY: prior.key,
      SENDBLUE_API_SECRET: prior.secret,
      SENDBLUE_PHONE_NUMBER: prior.phone,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetEnvCacheForTests();
  });

  it("sends from the configured line while account webhooks track delivery", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      message_handle: "sendblue-message-1",
      status: "QUEUED",
      service: "iMessage",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await new SendblueMessagingTransport(request).send({
      to: "+12025550198",
      body: "What is the smallest next step?",
      idempotencyKey: "reply:message-1",
      mediaUrl: "https://tempo.example/tempo.vcf",
    });

    expect(result).toEqual({
      provider: "sendblue",
      providerMessageSid: "sendblue-message-1",
      status: "queued",
      service: "iMessage",
      providerLineAddress: "+12025550111",
    });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.sendblue.com/api/send-message");
    expect(init?.headers).toMatchObject({
      "sb-api-key-id": "sendblue-test-key",
      "sb-api-secret-key": "sendblue-test-secret",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      from_number: "+12025550111",
      number: "+12025550198",
      content: "What is the smallest next step?",
      media_url: "https://tempo.example/tempo.vcf",
    });
  });

  it("surfaces provider rate-limit details without an ambiguous adapter retry", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error_code: "RATE_LIMITED",
      message: "Slow down",
    }), { status: 429, headers: { "retry-after": "30" } }));

    const error = await new SendblueMessagingTransport(request).send({
      to: "+12025550198",
      body: "Hello",
      idempotencyKey: "reply:message-2",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SendblueApiError);
    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED", retryAfterSeconds: 30 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

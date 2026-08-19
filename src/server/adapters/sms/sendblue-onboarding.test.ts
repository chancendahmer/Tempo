import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "../../config/env";
import { SendblueOnboardingService } from "./sendblue-onboarding";

const prior = {
  key: process.env.SENDBLUE_API_KEY,
  secret: process.env.SENDBLUE_API_SECRET,
  phone: process.env.SENDBLUE_PHONE_NUMBER,
};

describe("Sendblue sandbox onboarding", () => {
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

  it("creates the contact and requests Sendblue's one-time verification message", async () => {
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/verify")
        ? { status: "OK" }
        : {
            status: "OK",
            contact: {
              phone: "+14155550198",
              sendblue_number: "+12025550111",
              verified: false,
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const service = new SendblueOnboardingService(request);
    const assignment = await service.prepareContact("+14155550198");
    await service.requestVerification("+14155550198");

    expect(assignment).toEqual({ phoneNumber: "+12025550111", verified: false });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.sendblue.com/api/v2/contacts");
    expect(JSON.parse(String(init?.body))).toEqual({
      number: "+14155550198",
      sendblue_number: "+12025550111",
      tags: ["tempo-sandbox-demo"],
      update_if_exists: true,
    });
    expect(request.mock.calls[1][0]).toBe("https://api.sendblue.com/api/v2/contacts/verify");
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ number: "+14155550198" });
  });

  it("reports an already verified contact so Tempo can send the welcome directly", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      status: "OK",
      contact: { phone: "+14155550198", verified: true },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(new SendblueOnboardingService(request).prepareContact("+14155550198"))
      .resolves.toEqual({ phoneNumber: "+12025550111", verified: true });
  });

  it("fails signup when the sandbox cannot accept another contact", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response("{}", { status: 429 }));
    await expect(new SendblueOnboardingService(request).prepareContact("+14155550198"))
      .rejects.toMatchObject({ status: 429 });
  });

  it("surfaces a failed verification request for the signup route to handle with its fallback", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response("{}", { status: 429 }));
    await expect(new SendblueOnboardingService(request).requestVerification("+14155550198"))
      .rejects.toMatchObject({ status: 429 });
  });
});

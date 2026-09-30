import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "../../config/env";
import { SendblueOnboardingService } from "./sendblue-onboarding";

const prior = {
  key: process.env.SENDBLUE_API_KEY,
  secret: process.env.SENDBLUE_API_SECRET,
  phone: process.env.SENDBLUE_PHONE_NUMBER,
  mode: process.env.SENDBLUE_ONBOARDING_MODE,
};

describe("Sendblue sandbox onboarding", () => {
  beforeEach(() => {
    process.env.SENDBLUE_API_KEY = "sendblue-test-key";
    process.env.SENDBLUE_API_SECRET = "sendblue-test-secret";
    process.env.SENDBLUE_PHONE_NUMBER = "+12025550111";
    process.env.SENDBLUE_ONBOARDING_MODE = "dedicated";
    resetEnvCacheForTests();
  });

  afterEach(() => {
    for (const [name, value] of Object.entries({
      SENDBLUE_API_KEY: prior.key,
      SENDBLUE_API_SECRET: prior.secret,
      SENDBLUE_PHONE_NUMBER: prior.phone,
      SENDBLUE_ONBOARDING_MODE: prior.mode,
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

    expect(assignment).toEqual({ phoneNumber: "+12025550111", verified: false, verificationMethod: "provider_message" });
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
      contact: { phone: "+14155550198", sendblue_number: "+12025550111", verified: true },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(new SendblueOnboardingService(request).prepareContact("+14155550198"))
      .resolves.toEqual({ phoneNumber: "+12025550111", verified: true, verificationMethod: "provider_message" });
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

  it.each([{ status: "ERROR", message: "No contact found for this number" }, {}, { status: "OK", contact: {} }])("rejects malformed or application-error CRM success: %j", async payload => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload)));
    await expect(new SendblueOnboardingService(request).prepareContact("+14155550198")).rejects.toMatchObject({ status: 502 });
  });
  it.each([{ status: "ERROR", message: "No contact found for this number" }, {}])("does not claim verification was sent after a 200 error: %j", async payload => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload)));
    await expect(new SendblueOnboardingService(request).requestVerification("+14155550198")).rejects.toMatchObject({ status: 502 });
  });

  const sharedPayload = (verified = false) => ({ data: { contact: { phone_number: "+14155550198", verification_status: verified ? "verified" : "pending", verified }, line: { phone_number: "+12025550111", type: "shared" } } });
  function sharedMode() { process.env.SENDBLUE_ONBOARDING_MODE = "shared"; resetEnvCacheForTests(); }
  it.each([false, true])("uses validated shared-line route (verified %s) without a verification SMS", async verified => {
    sharedMode();
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(sharedPayload(verified))));
    const service = new SendblueOnboardingService(request);
    await expect(service.prepareContact("+14155550198")).resolves.toEqual({ phoneNumber: "+12025550111", verified, verificationMethod: "inbound" });
    expect(request.mock.calls[0][0]).toBe("https://api.sendblue.com/v3/verified-contacts");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ phone_number: "+14155550198" });
    await expect(service.requestVerification("+14155550198")).rejects.toMatchObject({ status: 409 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["identity", "status", "line", "type", "error", "missing"])("rejects shared route mismatch: %s", async kind => {
    sharedMode();
    const payload = sharedPayload();
    if (kind === "identity") payload.data.contact.phone_number = "+14155550199";
    if (kind === "status") payload.data.contact.verified = true;
    if (kind === "line") payload.data.line.phone_number = "+12025550112";
    if (kind === "type") payload.data.line.type = "dedicated";
    const body = kind === "error" ? { ...payload, status: "ERROR" } : kind === "missing" ? {} : payload;
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body)));
    await expect(new SendblueOnboardingService(request).prepareContact("+14155550198")).rejects.toMatchObject({ status: 502 });
  });
  it("never hides shared-line permission errors with a legacy fallback", async () => {
    sharedMode();
    const request = vi.fn<typeof fetch>(async () => new Response("{}", { status: 403 }));
    await expect(new SendblueOnboardingService(request).prepareContact("+14155550198")).rejects.toMatchObject({ status: 403 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

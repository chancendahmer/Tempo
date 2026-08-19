import twilio from "twilio";
import { describe, expect, it } from "vitest";
import {
  deliveryTwilioMessageSchema,
  inboundTwilioMessageSchema,
  twilioWebhookUrl,
  validateTwilioWebhook,
} from "./twilio-webhook";

describe("Twilio webhook boundary", () => {
  const authToken = "test-auth-token";
  const url = "https://tempo.example/api/twilio/inbound";
  const params = {
    MessageSid: "SM123",
    From: "+12025550198",
    To: "+14155550132",
    Body: "START",
    OptOutType: "START",
  };

  it("accepts the signature Twilio computes for the exact URL and fields", () => {
    const signature = twilio.getExpectedTwilioSignature(authToken, url, params);

    expect(validateTwilioWebhook({ authToken, signature, url, params })).toBe(true);
  });

  it("rejects a signature when a field is changed", () => {
    const signature = twilio.getExpectedTwilioSignature(authToken, url, params);

    expect(
      validateTwilioWebhook({ authToken, signature, url, params: { ...params, Body: "tampered" } }),
    ).toBe(false);
  });

  it("parses supported opt-out metadata", () => {
    expect(inboundTwilioMessageSchema.parse(params).OptOutType).toBe("START");
  });

  it("rejects unknown delivery statuses", () => {
    expect(() => deliveryTwilioMessageSchema.parse({ MessageSid: "SM123", MessageStatus: "mystery" })).toThrow();
  });

  it("constructs a canonical webhook URL from the configured public origin", () => {
    expect(twilioWebhookUrl("https://tempo.example", "/api/twilio/inbound", "?region=us")).toBe(
      "https://tempo.example/api/twilio/inbound?region=us",
    );
  });
});

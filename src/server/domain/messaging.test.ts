import { describe, expect, it } from "vitest";
import { mapTwilioDeliveryStatus } from "./messaging";

describe("Twilio delivery status mapping", () => {
  it.each([
    ["accepted", "queued"],
    ["queued", "queued"],
    ["sending", "sent"],
    ["sent", "sent"],
    ["delivered", "delivered"],
    ["read", "delivered"],
    ["undelivered", "undelivered"],
    ["failed", "failed"],
  ] as const)("maps %s to %s", (providerStatus, expected) => {
    expect(mapTwilioDeliveryStatus(providerStatus)).toBe(expected);
  });
});

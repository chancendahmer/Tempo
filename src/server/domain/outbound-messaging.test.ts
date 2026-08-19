import { describe, expect, it, vi } from "vitest";
import { TestSmsTransport } from "../adapters/sms/sms-transport";
import {
  MessagingPermission,
  OutboundMessageRepository,
  SafeSmsSender,
  evaluateMessagingPermission,
} from "./outbound-messaging";

const NOW = new Date("2026-08-18T16:00:00.000Z");

function permission(overrides: Partial<MessagingPermission> = {}): MessagingPermission {
  return {
    phoneE164: "+12025550198",
    userStatus: "active",
    latestConsent: "granted",
    pausedUntil: null,
    ...overrides,
  };
}

function repository(permissionSequence: MessagingPermission[], duplicate = false): OutboundMessageRepository {
  let permissionIndex = 0;
  return {
    getPermission: vi.fn(async () => permissionSequence[Math.min(permissionIndex++, permissionSequence.length - 1)] ?? null),
    reserve: vi.fn(async () => ({ messageId: "message-1", duplicate })),
    cancel: vi.fn(async () => undefined),
    markSubmitted: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
}

describe("outbound messaging safety", () => {
  it("blocks missing and revoked consent", () => {
    expect(evaluateMessagingPermission(null, NOW)).toEqual({ allowed: false, reason: "missing_consent" });
    expect(evaluateMessagingPermission(permission({ latestConsent: "revoked" }), NOW)).toEqual({
      allowed: false,
      reason: "missing_consent",
    });
  });

  it.each(["paused", "opted_out", "deleted"] as const)("blocks a %s user", (userStatus) => {
    expect(evaluateMessagingPermission(permission({ userStatus }), NOW)).toEqual({
      allowed: false,
      reason: userStatus === "opted_out" ? "opted_out" : userStatus,
    });
  });

  it("blocks a future pause even when the stored status is active", () => {
    expect(evaluateMessagingPermission(permission({ pausedUntil: new Date("2026-08-18T17:00:00.000Z") }), NOW)).toEqual({
      allowed: false,
      reason: "paused",
    });
  });

  it("does not call the provider for an opted-out user", async () => {
    const store = repository([permission({ userStatus: "opted_out" })]);
    const transport = new TestSmsTransport();

    const result = await new SafeSmsSender(store, transport, () => NOW).send({
      userId: "user-1",
      body: "Tempo check-in",
      kind: "coach",
      idempotencyKey: "check-in-1",
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });

    expect(result).toEqual({ sent: false, reason: "opted_out" });
    expect(transport.sent).toHaveLength(0);
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("rechecks consent after reservation and cancels before dispatch", async () => {
    const store = repository([permission(), permission({ userStatus: "opted_out" })]);
    const transport = new TestSmsTransport();

    const result = await new SafeSmsSender(store, transport, () => NOW).send({
      userId: "user-1",
      body: "Tempo check-in",
      kind: "coach",
      idempotencyKey: "check-in-1",
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });

    expect(result).toEqual({ sent: false, reason: "opted_out", messageId: "message-1" });
    expect(store.cancel).toHaveBeenCalledWith("message-1", "opted_out");
    expect(transport.sent).toHaveLength(0);
  });

  it("does not dispatch an idempotency-key duplicate", async () => {
    const store = repository([permission()], true);
    const transport = new TestSmsTransport();

    const result = await new SafeSmsSender(store, transport, () => NOW).send({
      userId: "user-1",
      body: "Tempo check-in",
      kind: "coach",
      idempotencyKey: "check-in-1",
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });

    expect(result).toEqual({ sent: false, reason: "duplicate", messageId: "message-1" });
    expect(transport.sent).toHaveLength(0);
  });

  it("submits one permitted message through the transport", async () => {
    const store = repository([permission(), permission(), permission()]);
    const transport = new TestSmsTransport();

    const result = await new SafeSmsSender(store, transport, () => NOW).send({
      userId: "user-1",
      body: "Tempo check-in",
      kind: "coach",
      idempotencyKey: "check-in-1",
      statusCallbackUrl: "https://tempo.example/api/twilio/status",
    });

    expect(result).toEqual({ sent: true, messageId: "message-1", provider: "test", providerMessageSid: "TEST000001" });
    expect(transport.sent).toEqual([
      {
        to: "+12025550198",
        body: "Tempo check-in",
        idempotencyKey: "check-in-1",
        statusCallbackUrl: "https://tempo.example/api/twilio/status",
      },
    ]);
    expect(store.markSubmitted).toHaveBeenCalledWith("message-1", "test", "TEST000001", undefined);
  });
});

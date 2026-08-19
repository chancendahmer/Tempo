import { describe, expect, it } from "vitest";
import { parseSendblueWebhook, validateSendblueWebhook } from "./sendblue-webhook";

function webhook(overrides: Record<string, unknown> = {}) {
  return {
    content: "Start the report",
    is_outbound: false,
    status: "RECEIVED",
    message_handle: "sendblue-message-1",
    from_number: "+12025550198",
    to_number: "+12025550111",
    sendblue_number: "+12025550111",
    service: "iMessage",
    message_type: "message",
    group_id: "",
    ...overrides,
  };
}

describe("Sendblue webhook boundary", () => {
  it("compares the configured signing secret without accepting omissions or partial values", () => {
    expect(validateSendblueWebhook({ secret: "tempo-secret", providedSecret: "tempo-secret" })).toBe(true);
    expect(validateSendblueWebhook({ secret: "tempo-secret", providedSecret: "tempo" })).toBe(false);
    expect(validateSendblueWebhook({ secret: "tempo-secret", providedSecret: null })).toBe(false);
  });

  it("normalizes a direct inbound iMessage", () => {
    expect(parseSendblueWebhook(webhook())).toEqual({
      kind: "inbound",
      eventId: "sendblue-message-1:RECEIVED",
      input: {
        provider: "sendblue",
        providerMessageId: "sendblue-message-1",
        from: "+12025550198",
        to: "+12025550111",
        body: "Start the report",
        service: "iMessage",
      },
    });
  });

  it("maps delivery failures and ignores group conversations", () => {
    expect(parseSendblueWebhook(webhook({
      is_outbound: true,
      status: "ERROR",
      message_handle: "sendblue-message-2",
      error_code: 4001,
      error_reason: "Delivery failed",
    }))).toEqual({
      kind: "delivery",
      eventId: "sendblue-message-2:ERROR",
      input: {
        provider: "sendblue",
        providerMessageId: "sendblue-message-2",
        status: "failed",
        errorCode: "4001",
        errorMessage: "Delivery failed",
      },
    });
    expect(parseSendblueWebhook(webhook({ message_type: "group", group_id: "group-1" })))
      .toEqual({ kind: "ignored", reason: "group_chat", eventId: "sendblue-message-1:RECEIVED" });
  });
});

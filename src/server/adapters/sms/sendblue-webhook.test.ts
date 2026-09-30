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
  it("normalizes lowercase SMS metadata without dropping delivery receipts", () => {
    expect(parseSendblueWebhook(webhook({ service: "sms" }))).toMatchObject({ kind: "inbound", input: { service: "SMS" } });
    expect(parseSendblueWebhook(webhook({ is_outbound: true, status: "SENT", service: "future-service" }))).toMatchObject({
      kind: "delivery", input: { providerMessageId: "sendblue-message-1", status: "sent" },
    });
    expect(parseSendblueWebhook(webhook({ service: undefined }))).toMatchObject({ kind: "inbound", input: { service: undefined } });
  });
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

  it("treats Sendblue's blank optional media URL as absent", () => {
    expect(parseSendblueWebhook(webhook({ media_url: "" }))).toEqual({
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
    expect(parseSendblueWebhook(webhook({ media_url: "   " }))).toEqual(expect.objectContaining({ kind: "inbound" }));
  });

  it.each(["not-a-url", "null", "undefined", "/attachment.jpg", "file:///attachment.jpg", "javascript:alert(1)", 123, false, {}, []])(
    "preserves inbound text when optional media metadata is unusable: %j",
    (mediaUrl) => {
      expect(parseSendblueWebhook(webhook({ media_url: mediaUrl }))).toEqual(parseSendblueWebhook(webhook()));
    },
  );

  it("accepts delivery receipts independently of optional media metadata", () => {
    const receipt = webhook({ is_outbound: true, status: "DELIVERED" });
    expect(parseSendblueWebhook({ ...receipt, media_url: "not-a-url" })).toEqual(parseSendblueWebhook(receipt));
  });

  it.each([undefined, null, "", "not-a-url"])("ignores an empty message without usable media: %j", (mediaUrl) => {
    expect(parseSendblueWebhook(webhook({ content: "", media_url: mediaUrl }))).toEqual({
      kind: "ignored",
      reason: "unsupported_content",
      eventId: "sendblue-message-1:RECEIVED",
    });
  });

  it.each(["http://example.com/photo.jpg", " https://example.com/photo.jpg?token=example "])(
    "recognizes valid media without retaining its URL: %s",
    (mediaUrl) => {
      const parsed = parseSendblueWebhook(webhook({ content: "", media_url: mediaUrl }));
      expect(parsed).toMatchObject({
        kind: "inbound",
        input: { body: "[Attachment]", contentParts: [{ type: "media", source: "sendblue" }] },
      });
      expect(JSON.stringify(parsed)).not.toContain(mediaUrl.trim());
    },
  );

  it("still rejects missing identifiers and invalid event direction", () => {
    expect(() => parseSendblueWebhook(webhook({ message_handle: "", media_url: "not-a-url" }))).toThrow();
    expect(() => parseSendblueWebhook(webhook({ is_outbound: "false" }))).toThrow();
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

  it("preserves Sendblue inline-reply relationships when the line exposes them", () => {
    expect(parseSendblueWebhook(webhook({
      reply_to: { message_handle: "sendblue-parent", part_index: 0 },
      thread_originator: { message_handle: "sendblue-root", part: "0:0" },
    }))).toEqual(expect.objectContaining({
      kind: "inbound",
      input: expect.objectContaining({
        replyToProviderMessageId: "sendblue-parent",
        providerThreadId: "sendblue-root",
      }),
    }));
  });
});

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseLinqWebhook, validateLinqWebhook } from "./linq-webhook";

const NOW = new Date("2026-08-19T15:00:00.000Z");
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));
const SECRET_BYTES = Buffer.from("tempo-linq-webhook-test-secret");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;

function signature(id: string, timestamp: string, body: string) {
  return `v1,${createHmac("sha256", SECRET_BYTES).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function event(eventType: "message.received" | "message.sent" | "message.delivered" | "message.read" | "message.failed") {
  return {
    api_version: "v3",
    webhook_version: "2026-02-03",
    event_type: eventType,
    event_id: "event-1",
    created_at: "2026-08-19T15:00:00.000Z",
    trace_id: "trace-1",
    partner_id: "partner-1",
  } as const;
}

describe("Linq webhook boundary", () => {
  it("validates the exact signed body and rejects tampering and stale replay", () => {
    const body = JSON.stringify({ hello: "Tempo" });
    const validSignature = signature("event-1", TIMESTAMP, body);
    expect(validateLinqWebhook({
      secret: SECRET, rawBody: body, webhookId: "event-1", timestamp: TIMESTAMP, signature: validSignature, now: NOW,
    })).toBe(true);
    expect(validateLinqWebhook({
      secret: SECRET, rawBody: `${body} `, webhookId: "event-1", timestamp: TIMESTAMP, signature: validSignature, now: NOW,
    })).toBe(false);
    expect(validateLinqWebhook({
      secret: SECRET,
      rawBody: body,
      webhookId: "event-1",
      timestamp: String(Number(TIMESTAMP) - 301),
      signature: validSignature,
      now: NOW,
    })).toBe(false);
  });

  it("normalizes a direct inbound iMessage without retaining attachment URLs", () => {
    expect(parseLinqWebhook({
      ...event("message.received"),
      data: {
        id: "message-1",
        direction: "inbound",
        service: "iMessage",
        chat: { is_group: false, owner_handle: { handle: "+12025550132" } },
        sender_handle: { handle: "+12025550198" },
        parts: [
          { type: "text", value: "  Start the report  " },
          { type: "media", url: "https://cdn.linqapp.com/private-file" },
        ],
      },
    })).toEqual({
      kind: "inbound",
      eventId: "event-1",
      input: {
        provider: "linq",
        providerMessageId: "message-1",
        from: "+12025550198",
        to: "+12025550132",
        body: "Start the report",
        service: "iMessage",
      },
    });
  });

  it("maps delivery lifecycle events and safely ignores group chats", () => {
    expect(parseLinqWebhook({
      ...event("message.failed"),
      data: { message_id: "message-2", code: 4001, reason: "Delivery failed" },
    })).toEqual({
      kind: "delivery",
      eventId: "event-1",
      input: {
        provider: "linq",
        providerMessageId: "message-2",
        status: "failed",
        errorCode: "4001",
        errorMessage: "Delivery failed",
      },
    });
    expect(parseLinqWebhook({
      ...event("message.received"),
      data: {
        id: "message-3",
        service: "iMessage",
        chat: { is_group: true, owner_handle: { handle: "+12025550132" } },
        sender_handle: { handle: "+12025550198" },
        parts: [{ type: "text", value: "hello" }],
      },
    })).toEqual({ kind: "ignored", reason: "group_chat", eventId: "event-1" });
  });
});

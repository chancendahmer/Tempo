import { createHmac } from "node:crypto";
import { DatabaseError } from "pg";
import { expect, it, vi } from "vitest";
import { POST as linq } from "./linq/webhook/route";
import { POST as sendblue } from "./sendblue/webhook/route";

const mocks = vi.hoisted(() => ({ ingest: vi.fn(), error: vi.fn() }));
const fixtureSecret = "synthetic-webhook-signature";
vi.mock("@/server/adapters/sms/linq-webhook", () => import("../../server/adapters/sms/linq-webhook"));
vi.mock("@/server/adapters/sms/sendblue-webhook", () => import("../../server/adapters/sms/sendblue-webhook"));
vi.mock("@/server/jobs/job-failure", () => import("../../server/jobs/job-failure"));
vi.mock("@/server/config/env", () => ({ requireEnv: () => ({
  SENDBLUE_WEBHOOK_SECRET: fixtureSecret, LINQ_WEBHOOK_SECRET: `whsec_${Buffer.from(fixtureSecret).toString("base64")}`,
}) }));
vi.mock("@/server/db/repositories/messaging-repository", () => ({ DrizzleMessagingRepository: class { ingestInbound = mocks.ingest; } }));
vi.mock("@/server/observability/logger", () => ({ logger: { error: mocks.error, warn: vi.fn(), info: vi.fn() } }));

const privateText = "SYNTHETIC_PRIVATE_SMS";
const from = "+12025550198", to = "+12025550132";

function signedLinqRequest() {
  const body = JSON.stringify({ api_version: "v3", webhook_version: "2026-02-03", event_type: "message.received", event_id: "fixture-event",
    created_at: new Date().toISOString(), trace_id: "fixture-trace", partner_id: "fixture-partner", data: {
    id: "fixture-message", direction: "inbound", service: "iMessage", chat: { id: "fixture-chat", is_group: false, owner_handle: { handle: to } },
    sender_handle: { handle: from }, parts: [{ type: "text", value: privateText }],
  } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", fixtureSecret).update(`fixture-event.${timestamp}.${body}`).digest("base64");
  return new Request("https://tempo.test/api/linq/webhook", { method: "POST", body, headers: {
    "webhook-id": "fixture-event", "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}`,
  } });
}

it.each([
  ["Linq", linq, signedLinqRequest],
  ["Sendblue", sendblue, () => new Request("https://tempo.test/api/sendblue/webhook", { method: "POST", headers: { "sb-signing-secret": fixtureSecret },
    body: JSON.stringify({ content: privateText, is_outbound: false, status: "RECEIVED", message_handle: "fixture-message", from_number: from, to_number: to }) })],
] as const)("keeps %s ingest failures private and retryable", async (provider, handler, makeRequest) => {
  vi.resetAllMocks();
  const driver = new DatabaseError(privateText, 0, "error");
  driver.code = "23514";
  mocks.ingest.mockRejectedValueOnce(new Error(`Failed SQL query, bind values: ${privateText}, ${from}`, { cause: driver }));
  const response = await handler(makeRequest());
  expect(mocks.ingest).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ from, body: privateText }));
  expect(response.status).toBe(500);
  expect(await response.text()).toBe("Webhook processing failed");
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith({ category: "database", sqlState: "23514" }, `${provider} webhook failed`);
});

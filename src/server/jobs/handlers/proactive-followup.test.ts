import { beforeEach, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { registerAccountabilityFollowupHandler } from "./accountability-followup";
import { registerFeedbackFollowupHandler } from "./feedback-followup";

const m = vi.hoisted(() => ({
  env: { LOG_LEVEL: "silent", INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [] as string[] },
  permission: vi.fn(), reserve: vi.fn(), submitted: vi.fn(), transportSend: vi.fn(), cancelled: vi.fn(), completed: vi.fn(), timeout: vi.fn(),
}));
const userId = "00000000-0000-4000-8000-000000000001";
vi.mock("../../config/env", () => ({ getServerEnv: () => m.env }));
vi.mock("../../adapters/sms/messaging-provider", () => ({ createMessagingTransport: () => ({ send: m.transportSend }) }));
vi.mock("../../db/repositories/intervention-repository", () => ({ DrizzleInterventionRepository: class {
  async getAccountabilityFollowupContext() { return { userId: "00000000-0000-4000-8000-000000000001", interventionId: "i" }; }
  async getFeedbackContext() { return { userId: "00000000-0000-4000-8000-000000000001", id: "i", hasProgress: false }; }
  async markAccountabilityFollowupSent() {}
} }));
vi.mock("../scheduled-action-repository", () => ({ ScheduledActionRepository: class {
  async markRunning() { return true; }
  markCancelled = m.cancelled; markCompleted = m.completed; completeAndScheduleFeedbackTimeout = m.timeout;
} }));
vi.mock("../../db/repositories/outbound-message-repository", () => ({ DrizzleOutboundMessageRepository: class {
  getPermission = m.permission; reserve = m.reserve; markSubmitted = m.submitted;
} }));
beforeEach(() => {
  vi.clearAllMocks();
  m.env.PROACTIVE_CANARY_USER_IDS = [userId];
  m.permission.mockResolvedValue({ userStatus: "active", latestConsent: "granted", phoneE164: "+12025550123", phoneVerified: true });
  m.reserve.mockResolvedValue({ duplicate: false, messageId: "out" });
  m.transportSend.mockResolvedValue({ provider: "test", providerMessageSid: "sent" });
});

it.each([registerAccountabilityFollowupHandler, registerFeedbackFollowupHandler])("withholds queued follow-up after removal and keeps normal consent checks", async register => {
  const work = vi.fn();
  await register({ work } as unknown as PgBoss);
  const run = () => work.mock.calls[0][2]([{ data: { scheduledActionId: "a", interventionId: "i", userId } }]);
  m.env.PROACTIVE_CANARY_USER_IDS = [];
  await run();
  expect(m.cancelled).toHaveBeenCalledWith("a", "proactive_delivery_disabled");
  expect(m.transportSend).not.toHaveBeenCalled();
  m.env.PROACTIVE_CANARY_USER_IDS = [userId];
  await run();
  expect(m.permission).toHaveBeenCalledTimes(2);
  expect(m.transportSend).toHaveBeenCalledOnce();
  m.permission.mockResolvedValue({ userStatus: "active", latestConsent: "revoked", phoneE164: "+12025550123" });
  await run();
  expect(m.transportSend).toHaveBeenCalledOnce();
});

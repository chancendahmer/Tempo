import { beforeEach, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { registerDeliverReminderHandler } from "./deliver-reminder";

const mocks = vi.hoisted(() => ({
  reconcileDelivery: vi.fn(), getDeliveryContext: vi.fn(), markSending: vi.fn(),
  recordSuccessfulDelivery: vi.fn(), reminderFailed: vi.fn(), send: vi.fn(),
  reservedBody: vi.fn(), markRunning: vi.fn(), markCompleted: vi.fn(), markCancelled: vi.fn(), actionFailed: vi.fn(),
}));
vi.mock("../../db/repositories/reminder-repository", () => ({ DrizzleReminderRepository: class {
  reconcileDelivery = mocks.reconcileDelivery; getDeliveryContext = mocks.getDeliveryContext;
  markSending = mocks.markSending; recordSuccessfulDelivery = mocks.recordSuccessfulDelivery;
  markFailed = mocks.reminderFailed; getOccurrenceIdempotencyKey = () => "same-occurrence";
} }));
vi.mock("../scheduled-action-repository", () => ({ ScheduledActionRepository: class {
  markRunning = mocks.markRunning; markCompleted = mocks.markCompleted;
  markCancelled = mocks.markCancelled; markFailed = mocks.actionFailed;
} }));
vi.mock("../../db/repositories/outbound-message-repository", () => ({ DrizzleOutboundMessageRepository: class { reservedBody = mocks.reservedBody; } }));
vi.mock("../../adapters/sms/messaging-provider", () => ({ createMessagingTransport: () => ({}) }));
vi.mock("../../domain/outbound-messaging", async original => ({ ...await original<typeof import("../../domain/outbound-messaging")>(), SafeSmsSender: class { send = mocks.send; } }));
vi.mock("../../db/repositories/task-repository", () => ({ DrizzleTaskRepository: class {} }));
vi.mock("../../db/repositories/goal-repository", () => ({ DrizzleGoalRepository: class {} }));
vi.mock("../../adapters/calendar/calendar-assistant", () => ({ CalendarAssistantIntegrations: class {} }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.markRunning.mockResolvedValue(true);
  mocks.markSending.mockResolvedValue(true);
  mocks.getDeliveryContext.mockResolvedValue({ id: "r", userId: "u", text: "Stretch" });
});

it("retries an in-flight duplicate, then reconciles without another provider submission", async () => {
  const work = vi.fn();
  await registerDeliverReminderHandler({ work } as unknown as PgBoss);
  const handle = work.mock.calls[0][2];
  const jobs = [{ data: { reminderId: "r", scheduledActionId: "a", occurrenceAt: "2026-09-30T15:45:00Z" } }];
  mocks.reconcileDelivery.mockResolvedValueOnce("pending").mockResolvedValueOnce("pending").mockResolvedValueOnce("sent");
  mocks.send.mockResolvedValue({ sent: false, reason: "duplicate" });
  await expect(handle(jobs)).rejects.toThrow("pending reconciliation");
  expect(mocks.reminderFailed).not.toHaveBeenCalled();
  expect(mocks.markCancelled).not.toHaveBeenCalled();
  expect(mocks.actionFailed).toHaveBeenCalledOnce();
  await handle(jobs);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.markCompleted).toHaveBeenCalledWith("a");
});

it("reuses a persisted briefing body on a retry instead of sending a changed plan", async () => {
  const work=vi.fn(); await registerDeliverReminderHandler({work} as unknown as PgBoss);
  mocks.getDeliveryContext.mockResolvedValue({id:"r",userId:"u",text:"Daily plan",contentMode:"daily_rundown"});
  mocks.reservedBody.mockResolvedValue("Your daily briefing\nCanonical saved plan");
  mocks.send.mockResolvedValue({sent:true,provider:"test",providerMessageSid:"accepted"});
  await work.mock.calls[0][2]([{data:{reminderId:"r",scheduledActionId:"a",occurrenceAt:"2026-10-05T15:00:00Z"}}]);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({body:"Your daily briefing\nCanonical saved plan",idempotencyKey:"same-occurrence",userId:"u"}));
});

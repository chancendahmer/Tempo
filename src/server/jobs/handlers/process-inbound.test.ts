import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { DatabaseError } from "pg";
import type { PgBoss } from "pg-boss";
import { beforeEach, expect, it, vi } from "vitest";
import { InboundOwnershipLostError } from "../../domain/inbound-execution";
import { OutboundDeliveryPendingError } from "../../domain/outbound-messaging";
import type { TempoDatabase } from "../../db/client";
import * as schema from "../../db/schema";
import { registerProcessInboundHandler } from "./process-inbound";

const mocks = vi.hoisted(() => ({
  process: vi.fn(), running: vi.fn(), failed: vi.fn(), completed: vi.fn(), error: vi.fn(), warn: vi.fn(),
}));
vi.mock("../../config/env", async original => ({ ...await original<typeof import("../../config/env")>(), getServerEnv: () => ({ APP_BASE_URL: "http://localhost:3000" }) }));
vi.mock("../../db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("../../db/repositories/web-reply-repository", () => ({ isWebMessage: async () => true, WebReplySender: class {} }));
vi.mock("../../domain/conversation-orchestrator", () => ({ ConversationOrchestrator: class { process = mocks.process; } }));
vi.mock("../../observability/logger", () => ({ logger: { error: mocks.error, warn: mocks.warn } }));
vi.mock("../scheduled-action-repository", () => ({ ScheduledActionRepository: class {
  markRunning = mocks.running;
  markFailed = mocks.failed;
  markCompleted = mocks.completed;
} }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.running.mockResolvedValue(true);
});

async function run(signal?: AbortSignal, scheduledActionId = "action") {
  const work = vi.fn();
  await registerProcessInboundHandler({ work } as unknown as PgBoss);
  return work.mock.calls[0][2]([{ id: "job", data: { scheduledActionId, messageId: "source" }, signal }]);
}

const privateValue = "SYNTHETIC_PRIVATE_MESSAGE";
function privateDatabaseError() {
  const driver = new DatabaseError(privateValue, 0, "error");
  driver.code = "23514";
  return new Error(`Failed query: insert ... params: ${privateValue}`, { cause: driver });
}

it("stores and retries only a safe classification for a driver error", async () => {
  mocks.process.mockRejectedValue(privateDatabaseError());
  const retry: unknown = await run().catch((error: unknown) => error);
  expect(retry).toBeInstanceOf(Error);
  expect(retry).toHaveProperty("message", "Inbound conversation processing failed (database SQLSTATE 23514)");
  expect(retry).not.toHaveProperty("cause");
  expect(mocks.failed).toHaveBeenCalledExactlyOnceWith("action", retry);
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith({ category: "database", sqlState: "23514", jobId: "job" }, "inbound conversation job failed");
  expect(mocks.completed).not.toHaveBeenCalled();
});

it("sanitizes a claim failure and leaves the action unclaimed", async () => {
  mocks.running.mockRejectedValue(privateDatabaseError());
  await expect(run()).rejects.toThrow("database SQLSTATE 23514");
  expect(mocks.failed).not.toHaveBeenCalled();
  expect(mocks.process).not.toHaveBeenCalled();
});

it("sanitizes a second driver error while recording the failure and keeps retrying", async () => {
  mocks.process.mockRejectedValue(new Error(privateValue));
  mocks.failed.mockRejectedValue(privateDatabaseError());
  await expect(run()).rejects.toThrow("Inbound conversation processing failed (unexpected)");
  expect(mocks.error.mock.calls).toEqual([
    [{ category: "database", sqlState: "23514", jobId: "job" }, "scheduled job failure record unavailable"],
    [{ category: "unexpected", jobId: "job" }, "inbound conversation job failed"],
  ]);
});

it("preserves the owned control outcome without logging or persisting the original exception", async () => {
  const lost = new InboundOwnershipLostError();
  lost.message = privateValue;
  mocks.process.mockRejectedValue(lost);
  await expect(run()).rejects.toBeInstanceOf(InboundOwnershipLostError);
  expect(mocks.failed).not.toHaveBeenCalled();
  expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ category: "ownership_lost", jobId: "job" }, "Inbound conversation processing interrupted");
});

it("keeps an aborted worker claim recoverable without persisting its reason", async () => {
  const controller = new AbortController();
  mocks.process.mockImplementationOnce(() => {
    controller.abort(new Error(privateValue));
    throw controller.signal.reason;
  });
  await expect(run(controller.signal)).rejects.toMatchObject({ name: "AbortError", message: "Inbound conversation processing cancelled" });
  expect(mocks.failed).not.toHaveBeenCalled();
  expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ category: "cancelled", jobId: "job" }, "Inbound conversation processing interrupted");
});

it("keeps uncertain outbound acceptance on the typed reconciliation retry", async () => {
  const pending = new OutboundDeliveryPendingError();
  pending.message = privateValue;
  mocks.process.mockRejectedValue(pending);
  await expect(run()).rejects.toBeInstanceOf(OutboundDeliveryPendingError);
  expect(mocks.failed).toHaveBeenCalledExactlyOnceWith("action", expect.objectContaining({ message: new OutboundDeliveryPendingError().message }));
  expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ category: "delivery_pending", jobId: "job" }), "inbound conversation job failed");
});

it("keeps a synthetic value from a real constraint violation out of logs and durable failure state", async () => {
  const client = new PGlite();
  try {
    const database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
    const [user] = await database.insert(schema.users).values({ phoneE164: "+12025550191" }).returning();
    const [action] = await database.insert(schema.scheduledActions).values({ userId: user.id, kind: "process_inbound_message", idempotencyKey: randomUUID(), runAt: new Date() }).returning();
    const id = randomUUID();
    await database.insert(schema.lifeItems).values({ id, userId: user.id, data: { kind: "note", title: "Owned thought", body: "" } });
    const { ScheduledActionRepository } = await vi.importActual<typeof import("../scheduled-action-repository")>("../scheduled-action-repository");
    const actions = new ScheduledActionRepository(database as unknown as TempoDatabase);
    mocks.running.mockImplementation(actions.markRunning.bind(actions));
    mocks.failed.mockImplementation(actions.markFailed.bind(actions));
    let realViolation = false;
    mocks.process.mockImplementationOnce(async () => {
      try {
        await database.insert(schema.lifeItems).values({ id, userId: user.id, data: { kind: "note", title: "Duplicate thought", body: privateValue } });
      } catch (error) {
        realViolation = error instanceof Error && error.message.includes(privateValue);
        throw error;
      }
    });
    const failure: unknown = await run(undefined, action.id).catch((error: unknown) => error);
    expect(realViolation).toBe(true);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toHaveProperty("cause");
    const [saved] = await database.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.id, action.id));
    expect(saved.status).toBe("failed");
    expect(saved.lastError).toMatch(/^Inbound conversation processing failed/);
    expect(JSON.stringify({ lastError: saved.lastError, errors: mocks.error.mock.calls, warnings: mocks.warn.mock.calls })).not.toContain(privateValue);
  } finally { await client.close(); }
}, 30_000);

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgBoss } from "pg-boss";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { ensureDirectConversation } from "../db/repositories/messaging-identity-repository";
import { OperationalRepository } from "../db/repositories/operational-repository";
import { recoverFailedInbound } from "./recover-inbound";
import { JOB_NAMES } from "./names";

const url = process.env.TEMPO_RECOVERY_TEST_DATABASE_URL;
describe.skipIf(!url)("real PostgreSQL operator recovery", () => {
  const pool = new Pool({ connectionString: url, max: 4 });
  const database = drizzle(pool, { schema });
  const boss = new PgBoss({ connectionString: url, supervise: false, schedule: false });
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) throw new Error("Use an isolated localhost database ending in _test.");
    const exists = await pool.query("select to_regclass('public.users') as relation");
    if (!exists.rows[0].relation) {
      for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
        await pool.query((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
      }
    }
    await boss.start();
    await boss.createQueue(JOB_NAMES.processInbound, { policy: "key_strict_fifo", retryLimit: 0 });
  });
  afterAll(async () => { await boss.stop(); await pool.end(); });

  async function seed(state: "reserved" | "ambiguous") {
    const phone = `+1202${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
    const [user] = await database.insert(schema.users).values({ phoneE164: phone, onboardingState: "complete" }).returning();
    const identity = await ensureDirectConversation(database, { userId: user.id, phoneE164: phone });
    const [inbound] = await database.insert(schema.conversationMessages).values({ userId: user.id, conversationId: identity.conversationId,
      direction: "inbound", kind: "user", status: "received", body: "Add a recovery test task" }).returning();
    await database.insert(schema.conversationMessages).values({ userId: user.id, conversationId: identity.conversationId,
      direction: "outbound", kind: "coach", status: "queued", body: "Saved.", idempotencyKey: `reply:${inbound.id}`, outboundState: state });
    const actionId = randomUUID();
    const jobId = (await boss.send(JOB_NAMES.processInbound, { userId: user.id, messageId: inbound.id, scheduledActionId: actionId }, { singletonKey: user.id }))!;
    await database.insert(schema.scheduledActions).values({ id: actionId, userId: user.id, kind: "process_inbound_message", status: "failed",
      idempotencyKey: `recovery-test:${inbound.id}`, queueJobId: jobId, payload: { messageId: inbound.id }, runAt: new Date() });
    // Fail only this fixture, without consuming unrelated queue work.
    await boss.fail(JOB_NAMES.processInbound, jobId);
    return { userId: user.id, jobId, actionId, operator: "automated-test", reason: "Verified isolated recovery fixture", apply: false };
  }

  it("dry-runs, retries one failed account job atomically, and keeps an audit without redispatching", async () => {
    const fixture = await seed("reserved");
    expect(await boss.getBlockedKeys(JOB_NAMES.processInbound)).toContain(fixture.userId);
    expect(await recoverFailedInbound(database, boss, fixture)).toMatchObject({ applied: false });
    expect((await boss.getJobById(JOB_NAMES.processInbound, fixture.jobId))?.state).toBe("failed");
    await recoverFailedInbound(database, boss, { ...fixture, apply: true });
    expect((await boss.getJobById(JOB_NAMES.processInbound, fixture.jobId))?.state).toBe("retry");
    expect(await boss.getBlockedKeys(JOB_NAMES.processInbound)).not.toContain(fixture.userId);
    const [action] = await database.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.id, fixture.actionId));
    expect(action.status).toBe("failed");
    expect(action.payload.recoveryAudit).toEqual([expect.objectContaining({ operator: fixture.operator, jobId: fixture.jobId })]);
    await expect(recoverFailedInbound(database, boss, { ...fixture, apply: true })).rejects.toThrow("failed inbound");
    await boss.cancel(JOB_NAMES.processInbound, fixture.jobId);
  });

  it("rejects foreign accounts and ambiguous delivery, which also appears in operational health", async () => {
    const fixture = await seed("ambiguous");
    await expect(recoverFailedInbound(database, boss, { ...fixture, userId: randomUUID(), apply: true })).rejects.toThrow("owned");
    await expect(recoverFailedInbound(database, boss, { ...fixture, apply: true })).rejects.toThrow("reconciliation");
    expect((await boss.getJobById(JOB_NAMES.processInbound, fixture.jobId))?.state).toBe("failed");
    expect((await new OperationalRepository(database).messageHealth()).ambiguousOutbound).toBeGreaterThan(0);
    await boss.cancel(JOB_NAMES.processInbound, fixture.jobId);
  });
});

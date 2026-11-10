import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { PILOT_SYNTHETIC_ADMISSION, pilotLoadConfig } from "../../../../scripts/pilot-load-config";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { DrizzleAccountControlRepository } from "./account-control-repository";
import { DrizzleInterventionRepository } from "./intervention-repository";
import { DrizzleMessagingRepository } from "./messaging-repository";
import { DrizzleOutcomeRepository } from "./outcome-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";

const fixtureUrl = process.env.TEST_DATABASE_URL;
const phone = { provider: "linq" as const, from: "+12025550164", to: "+14155550132" };

async function withFixture(run: (fixture: { database: TempoDatabase; pool: Pool; admin: Pool; userId: string }) => Promise<void>) {
  const { adminUrl } = pilotLoadConfig(["--database", fixtureUrl!]);
  const name = `tempo_sms_delivery_${randomUUID().replaceAll("-", "")}_test`;
  const assertFixture = () => expect(name).toMatch(/^tempo_sms_delivery_[a-f0-9]{32}_test$/);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1, query_timeout: 5_000 });
  const pool = new Pool({ connectionString: url.toString(), max: 2, query_timeout: 10_000, statement_timeout: 8_000 });
  let created = false;
  try {
    assertFixture();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
    await new DrizzleMessagingRepository(database, PILOT_SYNTHETIC_ADMISSION)
      .ingestInbound({ ...phone, providerMessageId: "race-start", body: "START" });
    const [owner] = await database.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phoneE164, phone.from));
    await run({ database, pool, admin, userId: owner.id });
  } finally {
    await pool.end();
    try {
      if (created) {
        assertFixture();
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      }
    } finally {
      await admin.end();
    }
  }
}

async function waitBehind<T>(pool: Pool, admin: Pool, first: (tx: TempoDatabase) => Promise<void>, second: (db: TempoDatabase) => Promise<T>) {
  const firstConnection = await pool.connect();
  try {
    const secondConnection = await pool.connect();
    try {
      const { rows: [{ pid }] } = await secondConnection.query<{ pid: number }>("select pg_backend_pid() as pid");
      let ready!: () => void;
      let release!: () => void;
      const firstReady = new Promise<void>(resolve => { ready = resolve; });
      const hold = new Promise<void>(resolve => { release = resolve; });
      const committing = drizzle(firstConnection, { schema }).transaction(async tx => {
        await first(tx as unknown as TempoDatabase);
        ready();
        await hold;
      });
      let waiting: Promise<T> | undefined;
      try {
        await Promise.race([firstReady, committing]);
        waiting = second(drizzle(secondConnection, { schema }) as unknown as TempoDatabase);
        void waiting.catch(() => undefined);
        const deadline = Date.now() + 4_000;
        let blocked = false;
        while (Date.now() < deadline && !blocked) {
          const state = await admin.query<{ blocked: boolean }>("select cardinality(pg_blocking_pids($1)) > 0 as blocked", [pid]);
          blocked = state.rows[0].blocked;
          if (!blocked) await delay(20);
        }
        expect(blocked).toBe(true);
      } finally {
        release();
        await committing;
        await waiting?.catch(() => undefined);
      }
      return await waiting!;
    } finally {
      secondConnection.release();
    }
  } finally {
    firstConnection.release();
  }
}

it.skipIf(!fixtureUrl)("real PostgreSQL: final submission waits for STOP and suppresses the reservation", async () => {
  await withFixture(async ({ database, pool, admin, userId }) => {
    const { messageId } = await new DrizzleOutboundMessageRepository(database).reserve({
      userId, body: "Synthetic consent race", kind: "coach", idempotencyKey: "consent-race",
    });
    const result = await waitBehind(pool, admin, async tx => {
      await new DrizzleMessagingRepository(tx, PILOT_SYNTHETIC_ADMISSION)
        .ingestInbound({ ...phone, providerMessageId: "race-stop", body: "STOP" });
    }, db => new DrizzleOutboundMessageRepository(db).beginSubmission(messageId, new Date()));
    expect(result).toEqual({ status: "blocked", reason: "missing_consent" });
    const [message] = await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, messageId));
    expect(message).toMatchObject({ status: "cancelled", outboundState: "suppressed", submissionStartedAt: null, providerMessageSid: null });
  });
}, 30_000);

it.skipIf(!fixtureUrl)("real PostgreSQL: callback and acceptance serialize in either arrival order", async () => {
  await withFixture(async ({ database, pool, admin, userId }) => {
    const outbound = new DrizzleOutboundMessageRepository(database);
    for (const first of ["receipt", "acceptance"]) {
      const { messageId } = await outbound.reserve({ userId, body: "Synthetic receipt race", kind: "coach", idempotencyKey: `receipt-race:${first}` });
      expect(await outbound.beginSubmission(messageId, new Date())).toMatchObject({ status: "started" });
      const providerMessageId = `receipt-race:${first}`;
      const receipt = (db: TempoDatabase) => new DrizzleMessagingRepository(db).updateDelivery({ provider: phone.provider, providerMessageId, status: "delivered" });
      const acceptance = (db: TempoDatabase) => new DrizzleOutboundMessageRepository(db).markSubmitted(messageId, phone.provider, providerMessageId);
      await waitBehind(pool, admin, first === "receipt" ? receipt : acceptance, first === "receipt" ? acceptance : receipt);
      const [message] = await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, messageId));
      const [binding] = await database.select().from(schema.providerMessageBindings).where(eq(schema.providerMessageBindings.messageId, messageId));
      expect(message).toMatchObject({ outboundState: "accepted", status: "delivered", deliveredAt: expect.any(Date), providerMessageSid: providerMessageId });
      expect(binding.deliveryStatus).toBe("delivered");
      expect(await database.select().from(schema.pendingDeliveryReceipts)).toHaveLength(0);
    }
  });
}, 30_000);

it.skipIf(!fixtureUrl)("real PostgreSQL: a known receipt follows account lock order with account erasure", async () => {
  await withFixture(async ({ database, pool, admin, userId }) => {
    const outbound = new DrizzleOutboundMessageRepository(database);
    const { messageId } = await outbound.reserve({ userId, body: "Synthetic erasure race", kind: "coach", idempotencyKey: "receipt-erasure" });
    expect(await outbound.beginSubmission(messageId, new Date())).toMatchObject({ status: "started" });
    const providerMessageId = "receipt-erasure";
    await outbound.markSubmitted(messageId, phone.provider, providerMessageId);
    await waitBehind(pool, admin, async tx => {
      expect(await new DrizzleAccountControlRepository(tx).deleteAccount(userId)).toBe(true);
    }, db => new DrizzleMessagingRepository(db).updateDelivery({ provider: phone.provider, providerMessageId, status: "delivered" }));
    expect(await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, messageId))).toHaveLength(0);
    expect(await database.select().from(schema.pendingDeliveryReceipts)).toHaveLength(0);
  });
}, 30_000);

it.skipIf(!fixtureUrl)("real PostgreSQL: intervention finalization and timeout serialize with delivery failure", async () => {
  await withFixture(async ({ database, pool, admin, userId }) => {
    const [policy] = await database.insert(schema.interventionPolicies).values({
      version: "receipt-projection-fixture", threshold: 0.5, holdoutBasisPoints: 1000, weights: {}, settings: {},
    }).returning({ id: schema.interventionPolicies.id });
    const outbound = new DrizzleOutboundMessageRepository(database);
    for (const first of ["receipt", "projection", "before-timeout"]) {
      const [snapshot] = await database.insert(schema.contextSnapshots).values({
        userId, policyId: policy.id, decision: "send", score: 0.8, opportunityKey: `projection-race:${first}`, reasonCodes: [], inputs: {},
      }).returning({ id: schema.contextSnapshots.id });
      const [intervention] = await database.insert(schema.interventions).values({
        userId, contextSnapshotId: snapshot.id, style: "micro_start", status: "queued", idempotencyKey: `intervention:${first}`,
      }).returning({ id: schema.interventions.id });
      const { messageId } = await outbound.reserve({
        userId, body: "Synthetic projection race", kind: "coach", idempotencyKey: `intervention-sms:${intervention.id}`,
        relatedInterventionId: intervention.id,
      });
      expect(await outbound.beginSubmission(messageId, new Date())).toMatchObject({ status: "started" });
      const providerMessageId = `projection:${first}`;
      await outbound.markSubmitted(messageId, phone.provider, providerMessageId);
      const receipt = (db: TempoDatabase) => new DrizzleMessagingRepository(db).updateDelivery({ provider: phone.provider, providerMessageId, status: "failed" });
      const projection = async (db: TempoDatabase) => {
        const status = await new DrizzleInterventionRepository(db).markSent(intervention.id, providerMessageId, new Date(), phone.provider);
        expect(status).toBe(first === "receipt" ? "failed" : "sent");
      };
      if (first === "before-timeout") {
        await projection(database);
        await waitBehind(pool, admin, receipt, db => new DrizzleOutcomeRepository(db).recordTimeout(intervention.id, new Date()));
        expect(await database.select().from(schema.interventionOutcomes)
          .where(eq(schema.interventionOutcomes.interventionId, intervention.id))).toHaveLength(0);
      } else {
        await waitBehind(pool, admin, first === "receipt" ? receipt : projection, first === "receipt" ? projection : receipt);
      }
      const [row] = await database.select().from(schema.interventions).where(eq(schema.interventions.id, intervention.id));
      expect(row).toMatchObject({ status: "failed", providerMessageSid: providerMessageId });
    }
  });
}, 30_000);

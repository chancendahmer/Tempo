import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pilotLoadConfig } from "../../../../scripts/pilot-load-config";
import { createWorkerAttestation, summarizeWorkerAttestations } from "../../observability/worker-attestation";
import * as schema from "../schema";
import { canonicalHeartbeatRetirement, heartbeatRetirementAcknowledgment, prepareHeartbeatRetirement, recordHeartbeatRetirement } from "./heartbeat-retirement";
import { OperationalRepository } from "./operational-repository";

const removedBuild = "a".repeat(40), currentBuild = "b".repeat(40);
const lastSeenAt = "2020-01-01T00:00:00.002123Z";
const changedAt = "2020-01-01T00:00:00.002124Z";
const evidenceRef = "railway-removed-fixture";
const operatorRef = "release-operator";
const key = (role: "worker" | "web") => `tempo-${role}:${randomUUID()}`;
const selection = (expectedWeb: number, expectedWorker: number) => ({ removedBuild, evidenceRef, expectedWeb, expectedWorker });
const apply = (expectedSha256: string) => ({ expectedSha256, acknowledge: heartbeatRetirementAcknowledgment, operatorRef });

it("hashes the exact timestamp, build, key and evidence and rejects legacy keys", () => {
  const first = { serviceKey: key("web"), lastSeenAt }, second = { serviceKey: key("worker"), lastSeenAt };
  const raw = { version: 1, removedBuild, evidenceRef, rows: [first, second] };
  const { sha256 } = canonicalHeartbeatRetirement(raw);
  expect(canonicalHeartbeatRetirement({ ...raw, rows: [second, first] }).sha256).toBe(sha256);
  expect(canonicalHeartbeatRetirement({ ...raw, rows: [{ ...first, lastSeenAt: changedAt }, second] }).sha256).not.toBe(sha256);
  expect(canonicalHeartbeatRetirement({ ...raw, evidenceRef: "different-evidence" }).sha256).not.toBe(sha256);
  expect(() => canonicalHeartbeatRetirement({ ...raw, rows: [first, first] })).toThrow();
  expect(() => canonicalHeartbeatRetirement({ ...raw, rows: [{ serviceKey: "tempo-worker", lastSeenAt }] })).toThrow();
  expect(() => canonicalHeartbeatRetirement({ ...raw, rows: [{ ...first, lastSeenAt: "2020-01-01T00:00:00.002Z" }] })).toThrow();
});

const fixtureUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!fixtureUrl)("heartbeat retirement on real PostgreSQL", () => {
  let admin: Pool, pool: Pool;
  const databaseName = `tempo_heartbeat_retire_${randomUUID().replaceAll("-", "")}_test`;
  let created = false;
  const assertOwned = () => expect(databaseName).toMatch(/^tempo_heartbeat_retire_[0-9a-f]{32}_test$/);

  beforeAll(async () => {
    const { adminUrl } = pilotLoadConfig(["--database", fixtureUrl!]);
    const url = new URL(adminUrl);
    url.pathname = `/${databaseName}`;
    admin = new Pool({ connectionString: adminUrl, max: 1, query_timeout: 5_000 });
    pool = new Pool({ connectionString: url.toString(), max: 5, query_timeout: 8_000 });
    assertOwned();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    if (created) {
      assertOwned();
      await admin.query(`DROP DATABASE "${databaseName}"`);
    }
    await admin?.end();
  });

  beforeEach(async () => { await pool.query("TRUNCATE service_heartbeats"); });

  const metadata = (build: string) => ({ ...createWorkerAttestation({ TEMPO_BUILD_SHA: build,
    INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false,
    CLEANUP_CHECKINS_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [] }, {
    blockedAccounts: 0, ambiguousOutbound: 0, pendingInbound: 0, oldestPendingSeconds: null,
  }), originalFixtureField: "preserved" });
  const pulse = (client: PoolClient | Pool, serviceKey: string, build: string, at: Date | string = new Date()) => client.query(
    `insert into service_heartbeats(service_key,last_seen_at,metadata,updated_at) values($1,$2,$3,$2)
     on conflict (service_key) do update set last_seen_at=excluded.last_seen_at, metadata=excluded.metadata, updated_at=excluded.updated_at`,
    [serviceKey, at, JSON.stringify(metadata(build))]);
  const all = async () => (await pool.query(`select service_key as "serviceKey",last_seen_at::text as "lastSeenAt",
    updated_at::text as "updatedAt",metadata from service_heartbeats order by service_key`)).rows;
  const backend = async (client: PoolClient) => (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
  async function waitForLock(waitingPid: number, blockerPid: number) {
    await expect.poll(async () => (await pool.query<{ waiting: boolean }>(
      "select $2::int = any(pg_blocking_pids($1)) as waiting", [waitingPid, blockerPid])).rows[0].waiting,
    { timeout: 1_500, interval: 15 }).toBe(true);
  }

  it("keeps dry runs read-only and archives both exact rows atomically and idempotently", async () => {
    const web = key("web"), worker = key("worker"), current = key("worker");
    const client = await pool.connect();
    try {
      await pulse(pool, web, removedBuild, lastSeenAt);
      await pulse(pool, worker, removedBuild, lastSeenAt);
      await pulse(pool, "tempo-worker", currentBuild);
      await pulse(pool, current, currentBuild);
      await expect(prepareHeartbeatRetirement(client, selection(1, 0))).rejects.toThrow("retirement_scope_unverified");
      const before = await all();
      const { manifest, sha256 } = await prepareHeartbeatRetirement(client, selection(1, 1));
      expect(manifest.rows.every(row => row.lastSeenAt === lastSeenAt)).toBe(true);
      expect(await recordHeartbeatRetirement(client, manifest)).toMatchObject({ reviewedRows: 2, applied: false, alreadyRecorded: false });
      expect(await all()).toEqual(before);
      await expect(recordHeartbeatRetirement(client, manifest, apply("0".repeat(64)))).rejects.toThrow("retirement_acknowledgment_mismatch");
      await pulse(pool, worker, removedBuild, changedAt);
      const beforeRejected = await all();
      await expect(recordHeartbeatRetirement(client, manifest, apply(sha256))).rejects.toThrow("retirement_target_changed");
      expect(await all()).toEqual(beforeRejected);
      await pulse(pool, worker, currentBuild, lastSeenAt);
      const beforeBuildMismatch = await all();
      await expect(recordHeartbeatRetirement(client, manifest, apply(sha256))).rejects.toThrow("retirement_target_changed");
      expect(await all()).toEqual(beforeBuildMismatch);
      await pulse(pool, worker, removedBuild, lastSeenAt);
      expect(await recordHeartbeatRetirement(client, manifest, apply(sha256))).toMatchObject({ applied: true, alreadyRecorded: false });
      const after = await all();
      expect(after).toHaveLength(before.length);
      for (const original of before.filter(row => [web, worker].includes(row.serviceKey))) {
        expect(after.find(row => row.serviceKey === `tempo-retired:${original.serviceKey.slice(6)}:${sha256}`)).toMatchObject({
          lastSeenAt: original.lastSeenAt, updatedAt: original.updatedAt,
          metadata: { ...original.metadata, retirementAudit: { version: 1, sha256, serviceKey: original.serviceKey,
            lastSeenAt, build: removedBuild, evidenceRef, operatorRef, retiredAt: expect.any(String) } },
        });
      }
      expect(await recordHeartbeatRetirement(client, manifest, apply(sha256))).toMatchObject({ applied: false, alreadyRecorded: true });
      expect(await all()).toEqual(after);
      const operational = new OperationalRepository(drizzle(pool, { schema }));
      const ready = summarizeWorkerAttestations(await operational.getWorkerHeartbeats(), currentBuild);
      expect(ready).toMatchObject({ ok: true, policyKnown: true, allCoachingDisabled: true, builds: [currentBuild] });
    } finally { client.release(); }
  });

  it("rejects exact CAS when a live pulse wins the PostgreSQL row lock", async () => {
    const worker = key("worker");
    const operator = await pool.connect(), writer = await pool.connect();
    try {
      await pulse(pool, worker, removedBuild, lastSeenAt);
      const { manifest, sha256 } = await prepareHeartbeatRetirement(operator, selection(0, 1));
      const operatorPid = await backend(operator), writerPid = await backend(writer);
      await writer.query("BEGIN");
      await pulse(writer, worker, removedBuild);
      const result = recordHeartbeatRetirement(operator, manifest, apply(sha256)).catch(error => error);
      try { await waitForLock(operatorPid, writerPid); }
      finally { await writer.query("COMMIT"); }
      expect(await result).toEqual(new Error("retirement_target_changed"));
      expect(await all()).toMatchObject([{ serviceKey: worker, metadata: metadata(removedBuild) }]);
      await expect(prepareHeartbeatRetirement(operator, selection(0, 1))).rejects.toThrow("retirement_scope_unverified");
    } finally {
      await writer.query("ROLLBACK").catch(() => undefined);
      operator.release(); writer.release();
    }
  });

  it("preserves the archive and reactivates the original key when a pulse waits behind retirement", async () => {
    const worker = key("worker"), current = key("worker");
    const operator = await pool.connect(), writer = await pool.connect();
    let archived!: () => void, finish!: () => void;
    const reachedArchive = new Promise<void>(resolve => { archived = resolve; });
    const finishRetirement = new Promise<void>(resolve => { finish = resolve; });
    const query = (async (statement: string, params?: unknown[]) => {
      const result = await operator.query(statement, params);
      if (statement.startsWith("update service_heartbeats")) { archived(); await finishRetirement; }
      return result;
    }) as PoolClient["query"];
    try {
      await pulse(pool, worker, removedBuild, lastSeenAt);
      await pulse(pool, current, currentBuild);
      await pulse(pool, "tempo-worker", currentBuild);
      const { manifest, sha256 } = await prepareHeartbeatRetirement(operator, selection(0, 1));
      const operatorPid = await backend(operator), writerPid = await backend(writer);
      const retirement = recordHeartbeatRetirement({ query }, manifest, apply(sha256));
      await Promise.race([reachedArchive, retirement]);
      const update = pulse(writer, worker, removedBuild);
      try { await waitForLock(writerPid, operatorPid); }
      finally { finish(); }
      await expect(retirement).resolves.toMatchObject({ applied: true });
      await update;
      const rows = await all();
      expect(rows.find(row => row.serviceKey === worker)).toMatchObject({ metadata: metadata(removedBuild) });
      expect(rows.find(row => row.serviceKey === `tempo-retired:${worker.slice(6)}:${sha256}`)).toMatchObject({
        metadata: { retirementAudit: { serviceKey: worker, lastSeenAt, sha256 } },
      });
      await expect(recordHeartbeatRetirement(operator, manifest, apply(sha256))).rejects.toThrow("retirement_target_changed");
      const operational = new OperationalRepository(drizzle(pool, { schema }));
      const ready = summarizeWorkerAttestations(await operational.getWorkerHeartbeats(), currentBuild);
      expect(ready).toMatchObject({ ok: false, buildMatchesWeb: false, problems: ["worker_build_mismatch"] });
    } finally { finish(); operator.release(); writer.release(); }
  });
});

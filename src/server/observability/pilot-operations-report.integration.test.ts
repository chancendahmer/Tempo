import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { readPilotOperationsReport } from "./pilot-operations-report";
import { createWorkerAttestation } from "./worker-attestation";

it("runs real report SQL in a read-only snapshot, folds private queue names, and rejects accidental writes", async () => {
  const client = new PGlite();
  const now = new Date("2026-10-22T12:00:00Z"), build = "abcdef1234567";
  try {
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    await client.exec("create schema pgboss; create table pgboss.job (name text, state text, created_on timestamptz)");
    await client.query("insert into users (phone_e164) values ($1)", ["+12025550199"]);
    await client.query("insert into pgboss.job values ($1,'failed',$2)", ["private-queue-name", now]);
    const metadata = createWorkerAttestation({ TEMPO_BUILD_SHA: build, RAILWAY_GIT_COMMIT_SHA: undefined, INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, CLEANUP_CHECKINS_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [] }, { blockedAccounts: 0, ambiguousOutbound: 0, pendingInbound: 0, oldestPendingSeconds: null });
    await client.query("insert into service_heartbeats (service_key,last_seen_at,metadata) values ($1,$2,$3)", ["tempo-worker:private-instance", now, JSON.stringify({ ...metadata, secret: "private-token" })]);
    let observedReadOnly = false, observedTimeout = false;
    const query = async (text: string, values?: unknown[]) => {
      const result = await client.query(text, values);
      if (text.startsWith("SET LOCAL")) {
        const settings = await client.query<{ readOnly: string; timeout: string }>("select current_setting('transaction_read_only') as \"readOnly\", current_setting('statement_timeout') as timeout");
        observedReadOnly = settings.rows[0].readOnly === "on";
        observedTimeout = settings.rows[0].timeout === "5s";
      }
      return result;
    };
    const report = await readPilotOperationsReport({ query } as unknown as Pick<PoolClient, "query">, { hours: 24, webBuild: build, now });
    expect(observedReadOnly).toBe(true); expect(observedTimeout).toBe(true);
    expect(report.worker.ok).toBe(true);
    expect(report.accounts.total).toBe(1);
    expect(report.queuedJobsAllTime).toEqual([{ queue: "other", state: "failed", count: 1, oldestSeconds: 0 }]);
    for (const value of ["+12025550199", "private-queue-name", "private-instance", "private-token"]) expect(JSON.stringify(report)).not.toContain(value);
    const accidentalWrite = async (text: string, values?: unknown[]) => {
      if (text.includes("from service_heartbeats")) await client.query("insert into users (phone_e164) values ($1)", ["+12025550198"]);
      return client.query(text, values);
    };
    await expect(readPilotOperationsReport({ query: accidentalWrite } as unknown as Pick<PoolClient, "query">, { hours: 24, webBuild: build, now })).rejects.toMatchObject({ code: "25006" });
    expect((await client.query<{ count: number }>("select count(*)::int as count from users")).rows[0].count).toBe(1);
  } finally { await client.close(); }
});

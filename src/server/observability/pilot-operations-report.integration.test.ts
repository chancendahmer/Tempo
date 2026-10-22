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
    await client.query(`insert into ai_budget_states (scope_key,window_day,settled_microdollars,outstanding_microdollars,outstanding_calls,halted,updated_at) values
      ('global','2026-10-21',9007199254740993,200,3,true,$1),('account:private-account-key','2026-10-21',9007199254740993,200,3,true,$1)`, [now]);
    await client.query(`insert into ai_budget_attempts (id,account_key,execution_id,operation,model,price_version,policy_version,reservation_fingerprint,window_day,reserved_microdollars,state,created_at,updated_at)
      select gen_random_uuid(),'private-account-key',gen_random_uuid(),'assistant','synthetic-model','synthetic-price','synthetic-policy','private-fingerprint','2026-10-21',cost,state,$1,$2
      from (values (100,'reserved'),(50,'submitting'),(50,'uncertain')) f(cost,state)`, [new Date(now.getTime() - 180_000), now]);
    await client.query(`insert into ai_budget_attempts (id,account_key,execution_id,operation,model,price_version,policy_version,reservation_fingerprint,window_day,reserved_microdollars,actual_microdollars,state,bound_violation,usage,created_at,updated_at)
      values (gen_random_uuid(),'private-account-key',gen_random_uuid(),'assistant','synthetic-model','synthetic-price','synthetic-policy','private-fingerprint','2026-10-21',1,9007199254740993,'settled',true,'{}',$1,$1)`, [now]);
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
    expect(report.aiBudget).toMatchObject({ available: true, enforcementVerified: false, headroomMicrodollars: null,
      global: { windowDay: "2026-10-21", settledMicrodollars: "9007199254740993", outstandingMicrodollars: "200", outstandingCalls: "3", halted: true, updatedAt: now.toISOString() },
      commitmentsAllTime: { reserved: 1, submitting: 1, uncertain: 1, stale: 3, oldestSeconds: 180, reservedMicrodollars: "200", unresolvedCalls: "3" },
      settlementsInWindow: { settled: 1, actualMicrodollars: "9007199254740993" }, violationsAllTime: { boundViolations: 1, actualOverReserved: 1 },
      versions: [{ priceVersion: "synthetic-price", policyVersion: "synthetic-policy", attempts: 4 }],
    });
    expect(report.problems).toEqual(expect.arrayContaining(["ai_budget_admission_review_required", "ai_budget_uncertain_usage_requires_reconciliation", "ai_budget_commitments_stale", "ai_budget_window_stale"]));
    expect(report.problems).not.toContain("ai_budget_ledger_mismatch");
    for (const value of ["+12025550199", "private-queue-name", "private-instance", "private-token", "private-account-key", "private-fingerprint"]) expect(JSON.stringify(report)).not.toContain(value);
    const accidentalWrite = async (text: string, values?: unknown[]) => {
      if (text.includes("from service_heartbeats")) await client.query("insert into users (phone_e164) values ($1)", ["+12025550198"]);
      return client.query(text, values);
    };
    await expect(readPilotOperationsReport({ query: accidentalWrite } as unknown as Pick<PoolClient, "query">, { hours: 24, webBuild: build, now })).rejects.toMatchObject({ code: "25006" });
    expect((await client.query<{ count: number }>("select count(*)::int as count from users")).rows[0].count).toBe(1);
    await client.query("alter table ai_budget_attempts drop column bound_violation");
    const outdated = await readPilotOperationsReport({ query } as unknown as Pick<PoolClient, "query">, { hours: 24, webBuild: build, now });
    expect(outdated.aiBudget).toMatchObject({ available: false, tables: { states: true, attempts: true, boundViolation: false }, global: null, commitmentsAllTime: null });
    expect(outdated.problems).toContain("ai_budget_schema_unavailable");
  } finally { await client.close(); }
});

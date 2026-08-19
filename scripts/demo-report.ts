import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";

loadEnvConfig(process.cwd());

const SENDBLUE_SANDBOX_CONTACT_LIMIT = 10;

async function main() {
  const { getDatabase, closeDatabase } = await import("../src/server/db/client");
  const database = getDatabase();

  const [messageResult, onboardingResult, consentResult, heartbeatResult] = await Promise.all([
    database.execute<{
      total: number;
      inbound: number;
      outbound: number;
      failed: number;
      activeUsers: number;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where direction = 'inbound')::int as inbound,
        count(*) filter (where direction = 'outbound')::int as outbound,
        count(*) filter (where status in ('failed', 'undelivered'))::int as failed,
        count(distinct user_id)::int as "activeUsers"
      from conversation_messages
      where provider = 'sendblue'
        and created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
    `),
    database.execute<{
      onboardingState: string;
      users: number;
    }>(sql`
      select onboarding_state as "onboardingState", count(*)::int as users
      from users
      where status <> 'deleted'
      group by onboarding_state
      order by onboarding_state
    `),
    database.execute<{ consentedUsers: number }>(sql`
      select count(*)::int as "consentedUsers"
      from users as account
      where account.status <> 'deleted'
        and (
          select consent.status
          from consent_records as consent
          where consent.user_id = account.id
          order by consent.created_at desc, consent.id desc
          limit 1
        ) = 'granted'
    `),
    database.execute<{ workerAgeSeconds: number | null }>(sql`
      select extract(epoch from (now() - last_seen_at))::int as "workerAgeSeconds"
      from service_heartbeats
      where service_key = 'tempo-worker'
      limit 1
    `),
  ]);

  const usage = messageResult.rows[0] ?? {
    total: 0,
    inbound: 0,
    outbound: 0,
    failed: 0,
    activeUsers: 0,
  };
  const consentedUsers = consentResult.rows[0]?.consentedUsers ?? 0;
  const estimatedContactSlotsRemaining = Math.max(0, SENDBLUE_SANDBOX_CONTACT_LIMIT - consentedUsers);
  const workerAgeSeconds = heartbeatResult.rows[0]?.workerAgeSeconds ?? null;
  const workerReady = workerAgeSeconds !== null && workerAgeSeconds < 120;

  console.log(`Sendblue sandbox activity for ${new Date().toISOString().slice(0, 10)} UTC`);
  console.table([{
    messages: usage.total,
    inbound: usage.inbound,
    outbound: usage.outbound,
    failures: usage.failed,
    activeUsers: usage.activeUsers,
    consentedUsers,
    estimatedContactSlotsRemaining,
    worker: workerReady ? "ready" : "stale",
  }]);
  console.table(onboardingResult.rows);

  if (!workerReady) {
    console.warn("BLOCKED: the worker heartbeat is missing or older than two minutes.");
  }
  if (estimatedContactSlotsRemaining === 0) {
    console.warn("CONTACT LIMIT: Tempo has recorded 10 consented users. Confirm Sendblue's contact dashboard before replacing anyone.");
  }

  await closeDatabase();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

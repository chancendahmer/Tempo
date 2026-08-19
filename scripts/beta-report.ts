import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDatabase, closeDatabase } = await import("../src/server/db/client");
  const database = getDatabase();
  const [summary, users] = await Promise.all([
    database.execute<{
      consentedUsers: number; optedOutUsers: number; sent: number; holdouts: number;
      responded: number; started: number; completed: number; helpful: number; rated: number;
      tasksStarted: number; tasksCompleted: number; activeGoals: number; completedGoals: number;
    }>(sql`
      select
        count(distinct u.id) filter (where latest_consent.status = 'granted')::int as "consentedUsers",
        count(distinct u.id) filter (where latest_consent.status = 'revoked')::int as "optedOutUsers",
        count(distinct i.id) filter (where i.status in ('sent','delivered','responded','expired'))::int as sent,
        count(distinct i.id) filter (where i.status = 'held_out')::int as holdouts,
        count(distinct i.id) filter (where i.responded_at is not null)::int as responded,
        count(distinct io.intervention_id) filter (where io.started_at is not null)::int as started,
        count(distinct io.intervention_id) filter (where io.completed_at is not null)::int as completed,
        count(distinct io.intervention_id) filter (where io.helpful = true)::int as helpful,
        count(distinct io.intervention_id) filter (where io.helpful is not null)::int as rated,
        count(distinct t.id) filter (where t.started_at is not null)::int as "tasksStarted",
        count(distinct t.id) filter (where t.status = 'completed')::int as "tasksCompleted",
        count(distinct g.id) filter (where g.status = 'active')::int as "activeGoals",
        count(distinct g.id) filter (where g.status = 'completed')::int as "completedGoals"
      from users u
      left join lateral (
        select c.status from consent_records c where c.user_id = u.id
        order by c.created_at desc, c.id desc limit 1
      ) latest_consent on true
      left join interventions i on i.user_id = u.id
      left join intervention_outcomes io on io.intervention_id = i.id
      left join tasks t on t.user_id = u.id
      left join goals g on g.user_id = u.id
    `),
    database.execute<{
      phone: string; sent: number; holdouts: number; started: number; completed: number; helpful: number; rated: number;
      tasksStarted: number; tasksCompleted: number; activeGoals: number;
    }>(sql`
      select
        concat(left(u.phone_e164, 4), '••••', right(u.phone_e164, 2)) as phone,
        count(distinct i.id) filter (where i.status in ('sent','delivered','responded','expired'))::int as sent,
        count(distinct i.id) filter (where i.status = 'held_out')::int as holdouts,
        count(distinct io.intervention_id) filter (where io.started_at is not null)::int as started,
        count(distinct io.intervention_id) filter (where io.completed_at is not null)::int as completed,
        count(distinct io.intervention_id) filter (where io.helpful = true)::int as helpful,
        count(distinct io.intervention_id) filter (where io.helpful is not null)::int as rated,
        count(distinct t.id) filter (where t.started_at is not null)::int as "tasksStarted",
        count(distinct t.id) filter (where t.status = 'completed')::int as "tasksCompleted",
        count(distinct g.id) filter (where g.status = 'active')::int as "activeGoals"
      from users u
      left join interventions i on i.user_id = u.id
      left join intervention_outcomes io on io.intervention_id = i.id
      left join tasks t on t.user_id = u.id
      left join goals g on g.user_id = u.id
      where u.status <> 'deleted'
      group by u.id, u.phone_e164
      order by sent desc, phone
    `),
  ]);
  const totals = summary.rows[0];
  const rate = (numerator: number, denominator: number) => denominator ? `${(100 * numerator / denominator).toFixed(1)}%` : "—";
  console.table([{
    consentedUsers: totals.consentedUsers,
    optOutRate: rate(totals.optedOutUsers, totals.consentedUsers + totals.optedOutUsers),
    sent: totals.sent,
    holdouts: totals.holdouts,
    responseRate: rate(totals.responded, totals.sent),
    initiationRate: rate(totals.started, totals.sent),
    completionRate: rate(totals.completed, totals.sent),
    helpfulRate: rate(totals.helpful, totals.rated),
    tasksStarted: totals.tasksStarted,
    tasksCompleted: totals.tasksCompleted,
    activeGoals: totals.activeGoals,
    completedGoals: totals.completedGoals,
  }]);
  console.table(users.rows.map((row) => ({
    user: row.phone, sent: row.sent, holdouts: row.holdouts,
    attributedStarts: row.started, attributedCompletions: row.completed, helpfulRate: rate(row.helpful, row.rated),
    tasksStarted: row.tasksStarted, tasksCompleted: row.tasksCompleted, activeGoals: row.activeGoals,
  })));
  await closeDatabase();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDatabase, closeDatabase } = await import("../src/server/db/client");
  const database = getDatabase();
  const result = await database.execute<{
    capturedAt: Date;
    userId: string;
    phone: string;
    decision: string;
    score: number;
    reasons: string[];
    task: string | null;
    policy: string | null;
  }>(sql`
    select
      cs.captured_at as "capturedAt",
      cs.user_id as "userId",
      concat(left(u.phone_e164, 4), '••••', right(u.phone_e164, 2)) as phone,
      cs.decision,
      round(cs.score::numeric, 3)::float as score,
      cs.reason_codes as reasons,
      t.title as task,
      ip.version as policy
    from context_snapshots cs
    join users u on u.id = cs.user_id
    left join tasks t on t.id = cs.task_id
    left join intervention_policies ip on ip.id = cs.policy_id
    order by cs.captured_at desc
    limit 100
  `);
  console.table(result.rows.map((row) => ({
    time: new Date(row.capturedAt).toISOString(),
    user: row.phone,
    decision: row.decision,
    score: row.score,
    task: row.task ?? "—",
    reasons: row.reasons.join(", "),
    policy: row.policy ?? "—",
  })));
  await closeDatabase();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

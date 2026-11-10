import { Client } from "pg";
import { diagnoseHistoricalLinkedWork } from "../../src/server/db/repositories/outbound-linked-work-diagnostic";

async function main() {
  if (process.argv.length > 2) throw new Error("invalid_arguments");
  if (!process.env.DATABASE_URL) throw new Error("database_configuration_unavailable");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4_000,
    query_timeout: 7_000, application_name: "tempo-readonly-disposition-linked-work" });
  client.on("error", () => undefined);
  try {
    await client.connect();
    const result = await diagnoseHistoricalLinkedWork(client);
    process.stdout.write(JSON.stringify({ ok: result.complete, readOnly: true, ...result }) + "\n");
    if (!result.complete) process.exitCode = 2;
  } finally { await client.end().catch(() => undefined); }
}

main().catch(error => {
  const outcomes = ["invalid_arguments", "database_configuration_unavailable", "queue_schema_unavailable"];
  const outcome = error instanceof Error && outcomes.includes(error.message) ? error.message : "linked_work_diagnostic_failed";
  process.stderr.write(JSON.stringify({ ok: false, outcome }) + "\n");
  process.exitCode = 1;
});

/** Operator-provided process configuration only; never loads populated env files. */
import { Pool } from "pg";
import { pilotReportHours, readPilotOperationsReport } from "../src/server/observability/pilot-operations-report";
import { resolveBuildIdentity } from "../src/server/observability/worker-attestation";

let phase = "configuration";
async function main() {
  const hours = pilotReportHours(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    process.stderr.write(JSON.stringify({ ok: false, reason: "database_url_required_in_process_environment" }) + "\n"); process.exitCode = 1; return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3_000, statement_timeout: 5_000, query_timeout: 8_000, application_name: "tempo-pilot-read-only-report" });
  try {
    phase = "connection";
    const client = await pool.connect();
    try {
      phase = "read_only_snapshot";
      const report = await readPilotOperationsReport(client, { hours, webBuild: resolveBuildIdentity({ TEMPO_BUILD_SHA: process.env.TEMPO_BUILD_SHA, RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA }) });
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      if (report.problems.length) process.exitCode = 2;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
main().catch(error => {
  // Provider/DB errors can carry credentials or user data. Expose only a class.
  process.stderr.write(JSON.stringify({ ok: false, reason: "read_only_report_failed", phase, category: error instanceof Error ? error.name : "UnknownError" }) + "\n");
  process.exitCode = 1;
});

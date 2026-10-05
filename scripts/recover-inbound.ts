import { PgBoss } from "pg-boss";
import { closeDatabase, getDatabase } from "../src/server/db/client";
import { recoverFailedInbound, recoveryRequestSchema } from "../src/server/jobs/recover-inbound";

async function main() {
  const value = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  if (!["--user", "--job", "--operator", "--reason"].every(name => process.argv.includes(name))) {
    throw new Error("Usage: tsx scripts/recover-inbound.ts --user UUID --job UUID --operator NAME --reason TEXT [--apply]. Default is dry run.");
  }
  const input = recoveryRequestSchema.parse({ userId: value("--user"), jobId: value("--job"), operator: value("--operator"), reason: value("--reason"), apply: process.argv.includes("--apply") });
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL in the process environment. Secret files are not loaded by this command.");
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss", supervise: false, schedule: false, migrate: false });
  try {
    await boss.start();
    console.log(JSON.stringify(await recoverFailedInbound(getDatabase(), boss, input)));
  } finally { await boss.stop(); await closeDatabase(); }
}
main().catch(error => { console.error(error instanceof Error && /^(Usage:|Configure|A failed|Job and|The inbound|An inbound|Provider submission)/.test(error.message) ? error.message : "Recovery failed; no unverified provider resend was authorized. Inspect scoped worker diagnostics."); process.exitCode = 1; });

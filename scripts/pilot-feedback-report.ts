import { loadEnvConfig } from "@next/env";
import { z } from "zod";

async function main() {
  const args = process.argv.slice(2);
  let reportId: string | undefined, includeDetail = false, limit = 25;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--report") reportId = z.uuid().parse(args[++index]);
    else if (arg === "--details") includeDetail = true;
    else if (arg === "--limit") limit = z.coerce.number().int().min(1).max(100).parse(args[++index]);
    else throw new Error("Use --limit 1..100, or --report UUID [--details].");
  }
  if (includeDetail && !reportId) throw new Error("--details requires one --report UUID.");
  loadEnvConfig(process.cwd());
  const { requireEnv } = await import("../src/server/config/env");
  const { closeDatabase } = await import("../src/server/db/client");
  const { PilotFeedbackRepository } = await import("../src/server/db/repositories/pilot-feedback-repository");
  try {
    const env = requireEnv(["DATABASE_URL", "FIELD_ENCRYPTION_KEY"]);
    const rows = await new PilotFeedbackRepository().operatorReports(env.FIELD_ENCRYPTION_KEY!, { reportId, includeDetail, limit });
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } finally { await closeDatabase(); }
}

main().catch(() => {
  // Provider credentials, SQL parameters and user-written details must not enter
  // error output. Successful --details is an explicit single-report disclosure.
  process.stderr.write("Feedback report unavailable. Check arguments, database access and encryption configuration.\n");
  process.exitCode = 1;
});

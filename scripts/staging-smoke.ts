const baseUrl = process.env.STAGING_BASE_URL;
if (!baseUrl) throw new Error("STAGING_BASE_URL is required");

async function check(path: string, expectedStatus = 200) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  if (response.status !== expectedStatus) throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}`);
  return response;
}

async function main() {
  const health = await (await check("/api/health")).json() as {
    ok: boolean;
    shadowMode: boolean;
    autonomousSendingEnabled: boolean;
  };
  if (!health.ok || !health.shadowMode || health.autonomousSendingEnabled) {
    throw new Error("Staging must be healthy, in shadow mode, and have autonomous sending disabled");
  }
  const ready = await (await check("/api/ready")).json() as { ok: boolean; database: string; worker: string };
  if (!ready.ok || ready.database !== "ready" || ready.worker !== "ready") throw new Error("Database or worker is not ready");
  for (const path of ["/", "/how-it-works", "/pricing", "/terms", "/privacy"]) await check(path);
  process.stdout.write("Staging smoke checks passed: web, database, worker, safety switches, and public pages.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

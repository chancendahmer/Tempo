import { writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Client } from "pg";
import { dispositionRef, prepareLegacyOutboundDisposition } from "../../src/server/db/repositories/outbound-dispositions";

async function main(args: string[]) {
  const [approvalRef, outputFlag, outputPath] = args;
  if ((args.length !== 1 && args.length !== 3) || !dispositionRef.safeParse(approvalRef).success
      || (args.length === 3 && (process.platform === "win32" || outputFlag !== "--private-output" || extname(outputPath) !== ".json"
        || /^(?:\.env|secrets\.|local\.settings\.)/i.test(basename(outputPath))))) throw new Error("invalid_arguments");
  if (!process.env.DATABASE_URL) throw new Error("database_configuration_unavailable");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4_000,
    query_timeout: 7_000, application_name: "tempo-readonly-disposition-preview" });
  client.on("error", () => undefined);
  try {
    await client.connect();
    const preview = await prepareLegacyOutboundDisposition(client, approvalRef);
    if (outputPath && preview.manifest) {
      await writeFile(outputPath, JSON.stringify(preview.manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    }
    process.stdout.write(JSON.stringify({ ok: preview.report.eligible, readOnly: true, ...preview.report,
      privateManifestSaved: Boolean(outputPath && preview.manifest) }) + "\n");
    if (!preview.report.eligible) process.exitCode = 2;
  } finally { await client.end().catch(() => undefined); }
}

main(process.argv.slice(2)).catch(error => {
  const outcomes = ["invalid_arguments", "database_configuration_unavailable", "disposition_or_queue_schema_unavailable"];
  const outcome = error instanceof Error && outcomes.includes(error.message) ? error.message : "disposition_preview_failed";
  process.stderr.write(JSON.stringify({ ok: false, outcome }) + "\n");
  process.exitCode = 1;
});

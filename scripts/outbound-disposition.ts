import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Client } from "pg";
import { recordOutboundDisposition } from "../src/server/db/repositories/outbound-dispositions";

const errors = new Set([
  "invalid_arguments", "invalid_manifest_file", "database_configuration_unavailable", "manifest_acknowledgment_mismatch",
  "disposition_or_queue_schema_unavailable", "manifest_target_unverified", "linked_work_pending", "manifest_latest_disposition_mismatch",
]);

function optionsFrom(args: string[]) {
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--apply" && !apply) { apply = true; continue; }
    const value = args[++index];
    if (!["--manifest", "--expected-sha256", "--acknowledge", "--operator"].includes(key)
        || values.has(key) || !value || value.startsWith("--")) throw new Error("invalid_arguments");
    values.set(key, value);
  }
  const manifest = values.get("--manifest");
  const expectedSha256 = values.get("--expected-sha256");
  const acknowledge = values.get("--acknowledge");
  const operatorRef = values.get("--operator");
  if (!manifest || (apply && (!expectedSha256 || !acknowledge || !operatorRef))
      || (!apply && values.size !== 1)) throw new Error("invalid_arguments");
  return { manifest, decision: apply ? { apply: true as const, expectedSha256: expectedSha256!, acknowledge: acknowledge!, operatorRef: operatorRef! } : {} };
}

async function readManifest(path: string): Promise<unknown> {
  if (extname(path) !== ".json" || /^(?:\.env|secrets\.|local\.settings\.)/i.test(basename(path))) throw new Error("invalid_manifest_file");
  try {
    if (!(await lstat(path)).isFile()) throw new Error("invalid_manifest_file");
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const file = await handle.stat();
      if (!file.isFile() || file.size < 1 || file.size > 32_768 || (process.platform !== "win32" && (file.mode & 0o077) !== 0)) {
        throw new Error("invalid_manifest_file");
      }
      return JSON.parse(await handle.readFile("utf8"));
    } finally { await handle.close(); }
  } catch { throw new Error("invalid_manifest_file"); }
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("database_configuration_unavailable");
  const manifest = await readManifest(options.manifest);
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4_000,
    query_timeout: 7_000, application_name: "tempo-outbound-disposition" });
  client.on("error", () => undefined);
  try {
    await client.connect();
    const result = await recordOutboundDisposition(client, manifest, options.decision);
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } finally { await client.end().catch(() => undefined); }
}

main().catch(error => {
  const outcome = error instanceof Error && errors.has(error.message) ? error.message : "outbound_disposition_failed";
  process.stderr.write(JSON.stringify({ ok: false, outcome }) + "\n");
  process.exitCode = 1;
});

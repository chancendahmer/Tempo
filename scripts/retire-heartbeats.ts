import { constants } from "node:fs";
import { lstat, open, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { prepareHeartbeatRetirement, recordHeartbeatRetirement } from "../src/server/db/repositories/heartbeat-retirement";

const knownErrors = new Set(["invalid_arguments", "invalid_manifest_file", "database_configuration_unavailable",
  "retirement_scope_unverified", "retirement_target_changed", "retirement_acknowledgment_mismatch"]);
const manifestPath = (path: string) => extname(path) === ".json" && !/^(?:\.env|secrets\.|local\.settings\.)/i.test(basename(path));

function argumentsFrom(args: string[]) {
  const parsed = parseArgs({ args, tokens: true, options: {
    prepare: { type: "boolean" }, "removed-build": { type: "string" }, "expected-web": { type: "string" },
    "expected-worker": { type: "string" }, "evidence-ref": { type: "string" }, "private-output": { type: "string" },
    manifest: { type: "string" }, apply: { type: "boolean" }, "expected-sha256": { type: "string" },
    acknowledge: { type: "string" }, operator: { type: "string" },
  } });
  const { values, tokens } = parsed;
  const names = tokens.flatMap(token => token.kind === "option" ? [token.name] : []);
  if (new Set(names).size !== names.length) throw new Error("invalid_arguments");
  if (values.prepare) {
    const path = values["private-output"], web = values["expected-web"], worker = values["expected-worker"];
    if (names.length !== 6 || !path || !manifestPath(path) || !values["removed-build"] || !values["evidence-ref"] ||
      web === undefined || worker === undefined || !/^\d{1,2}$/.test(web) || !/^\d{1,2}$/.test(worker) || process.platform === "win32") {
      throw new Error("invalid_arguments");
    }
    return { path, selection: { removedBuild: values["removed-build"], evidenceRef: values["evidence-ref"],
      expectedWeb: Number(web), expectedWorker: Number(worker) } };
  }
  if (!values.manifest || !manifestPath(values.manifest) || names.length !== (values.apply ? 5 : 1)) throw new Error("invalid_arguments");
  if (!values.apply) return { path: values.manifest };
  const expectedSha256 = values["expected-sha256"], acknowledge = values.acknowledge, operatorRef = values.operator;
  if (!expectedSha256 || !acknowledge || !operatorRef) throw new Error("invalid_arguments");
  return { path: values.manifest, apply: { expectedSha256, acknowledge, operatorRef } };
}

async function readPrivateManifest(path: string) {
  try {
    if (!(await lstat(path)).isFile()) throw new Error("invalid_manifest_file");
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > 32_768 || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) {
        throw new Error("invalid_manifest_file");
      }
      return JSON.parse(await file.readFile("utf8")) as unknown;
    } finally { await file.close(); }
  } catch { throw new Error("invalid_manifest_file"); }
}

async function main() {
  let options: ReturnType<typeof argumentsFrom>;
  try { options = argumentsFrom(process.argv.slice(2)); }
  catch { throw new Error("invalid_arguments"); }
  if (!process.env.DATABASE_URL) throw new Error("database_configuration_unavailable");
  const input = options.selection ? undefined : await readPrivateManifest(options.path);
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4_000,
    query_timeout: 8_000, application_name: "tempo-heartbeat-retirement" });
  client.on("error", () => undefined);
  try {
    await client.connect();
    if (options.selection) {
      const { manifest, sha256, web, worker } = await prepareHeartbeatRetirement(client, options.selection);
      await writeFile(options.path, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      process.stdout.write(JSON.stringify({ ok: true, readOnly: true, sha256, web, worker, privateManifestSaved: true }) + "\n");
    } else {
      const result = await recordHeartbeatRetirement(client, input, options.apply);
      process.stdout.write(JSON.stringify({ ok: true, readOnly: !options.apply, ...result }) + "\n");
    }
  } finally { await client.end().catch(() => undefined); }
}

void main().catch(error => {
  const outcome = error instanceof Error && knownErrors.has(error.message) ? error.message : "heartbeat_retirement_failed";
  process.stderr.write(JSON.stringify({ ok: false, outcome }) + "\n");
  process.exitCode = 1;
});

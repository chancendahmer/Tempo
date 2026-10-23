/** Normal activation links for the named, isolated browser QA account. No provider calls. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { WebSessionService } from "../../src/server/security/web-session";
import { issueActionToken } from "../../src/server/security/action-token";
import * as schema from "../../src/server/db/schema";

async function main() {
  assert.equal(process.argv.length, 2, "Only fixed local fixture supported");
  const fixture = JSON.parse(await readFile("qa/adaptive-followthrough/local-sign-in.json", "utf8"));
  assert.equal(fixture.base, "http://localhost:3103");
  assert.equal(fixture.displayName, "QA Riley");
  for (const name of Object.keys(process.env)) if (/^PG/i.test(name)) delete process.env[name];
  process.env.PGPASSFILE = "NUL";
  const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 1, connectionTimeoutMillis: 3000 });
  try {
    const identity = await pool.query("select display_name,profile_instructions,proactive_opt_in from users where id=$1", [fixture.userId]);
    assert.equal(identity.rows[0]?.display_name, "QA Riley");
    assert.match(identity.rows[0]?.profile_instructions ?? "", /^Synthetic isolated QA account/);
    assert.equal(identity.rows[0]?.proactive_opt_in, false);
    const session = await new WebSessionService(drizzle(pool, { schema })).create(fixture.userId);
    const token = issueActionToken({ userId: fixture.userId, scope: "account:signin", sessionId: session.id }, Buffer.alloc(32, 7).toString("base64"));
    await writeFile("qa/pilot-2026-10-22/fresh-browser/local-access.json", JSON.stringify({ base: fixture.base, userId: fixture.userId, sessionId: session.id, url: `${fixture.base}/api/auth/phone?token=${encodeURIComponent(token)}` }) + "\n");
    console.log("Prepared one normal, single-use local QA Riley activation link in ignored local-access.json. No provider calls.");
  } finally { await pool.end(); }
}
void main().catch(() => { console.error("Local QA activation preparation failed; no credentials printed."); process.exitCode = 1; });

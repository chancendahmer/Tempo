/** Read-only isolated PG assertions; normal old-session link is saved only to an ignored local file. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { issueActionToken } from "../../../src/server/security/action-token";

const mode = process.argv[2];
assert.equal(process.argv.length, 3, "Supply one supported rehearsal mode; no alternate host/database");
assert.ok(["prepare", "capture-old", "verify", "replacement-link", "verify-onboarding"].includes(mode));
for (const name of Object.keys(process.env)) if (/^PG/i.test(name)) delete process.env[name];
process.env.PGPASSFILE = "NUL";
const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 1, connectionTimeoutMillis: 3000, query_timeout: 10000, options: "-c default_transaction_read_only=on" });
const folder = resolve(process.cwd(), "qa/pilot-2026-10-22/signup-rehearsal");
const manifestPath = resolve(folder, "rehearsal.json");
type Manifest = { origin: "http://localhost:3103"; preparedAt: string; numbers: string[]; oldSessionId?: string; capturedAt?: string; replacementSessionId?: string; replacementCapturedAt?: string };
type Row = { user_id: string; phone_verified_at: Date | null; session_id: string; created_at: Date; expires_at: Date; activated_at: Date | null; revoked_at: Date | null };
async function rows(phone: string) {
  assert.match(phone, /^\+120255501\d{2}$/);
  return (await pool.query<Row>("select u.id as user_id,u.phone_verified_at,s.id as session_id,s.created_at,s.expires_at,s.activated_at,s.revoked_at from users u join web_sessions s on s.user_id=u.id where u.phone_e164=$1 order by s.created_at", [phone])).rows;
}
async function noJobs(userIds: string[]) {
  const result = await pool.query("select count(*)::int as count from scheduled_actions where user_id=any($1::uuid[])", [userIds]);
  assert.equal(result.rows[0].count, 0, "Rehearsal account has scheduled actions; stop before any dispatch");
}
async function emptyAccount(userId: string) {
  const result = await pool.query<{ tasks: number; goals: number; lifeItems: number; proactiveOptIn: boolean; setupStatus: string; timezoneConfirmed: boolean }>(`select
    (select count(*)::int from tasks where user_id=$1) as tasks,
    (select count(*)::int from goals where user_id=$1) as goals,
    (select count(*)::int from life_items where user_id=$1) as "lifeItems",
    proactive_opt_in as "proactiveOptIn",coalesce(workspace_preferences->>'setupStatus','new') as "setupStatus",
    (workspace_preferences->>'timezoneConfirmedAt') is not null as "timezoneConfirmed"
    from users where id=$1`, [userId]);
  assert.equal(result.rows.length, 1);
  const state = result.rows[0];
  assert.equal(state.tasks, 0); assert.equal(state.goals, 0); assert.equal(state.lifeItems, 0); assert.equal(state.proactiveOptIn, false);
  return state;
}
async function main() {
  if (mode === "prepare") {
    assert.ok(!existsSync(manifestPath), "Manifest already exists; do not silently rotate this rehearsal's identities");
    const candidates = Array.from({ length: 90 }, (_, index) => `+120255501${String(index).padStart(2, "0")}`).filter(value => value !== "+12025550111");
    const existing = await pool.query<{ phone_e164: string }>("select phone_e164 from users where phone_e164=any($1::text[])", [candidates]);
    const used = new Set(existing.rows.map(row => row.phone_e164));
    const numbers = candidates.filter(value => !used.has(value)).slice(0, 2);
    assert.equal(numbers.length, 2, "Two unused fictional contacts are required");
    const manifest: Manifest = { origin: "http://localhost:3103", preparedAt: new Date().toISOString(), numbers };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ syntheticOnly: true, mode, unusedNumbers: numbers, database: "loopback55437/tempo_ui_release", databaseWrites: 0 }));
    return;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  assert.equal(manifest.origin, "http://localhost:3103"); assert.equal(manifest.numbers.length, 2);
  assert.equal(new Set(manifest.numbers).size, 2);
  for (const phone of manifest.numbers) { assert.match(phone, /^\+120255501[0-8]\d$/); assert.notEqual(phone, "+12025550111"); }
  const first = await rows(manifest.numbers[0]);
  assert.equal(first.length, 1, "Original signup must have exactly one original session");
  const old = first[0]; assert.equal(old.phone_verified_at, null); assert.equal(old.activated_at, null);
  if (mode === "capture-old") {
    assert.equal(old.revoked_at, null); assert.ok(old.expires_at.getTime() > Date.now());
    assert.ok(old.created_at.getTime() > Date.now() - 15 * 60_000, "Original claim must still be recent");
    assert.equal((await rows(manifest.numbers[1])).length, 0, "Capture before replacement signup");
    await noJobs([old.user_id]);
    const token = issueActionToken({ userId: old.user_id, sessionId: old.session_id, scope: "account:signin" }, Buffer.alloc(32, 7).toString("base64"));
    await mkdir(resolve(folder, "private"), { recursive: true });
    await writeFile(resolve(folder, "private/old-signin.local.json"), JSON.stringify({ syntheticOnly: true, signInUrl: `${manifest.origin}/api/auth/phone?token=${token}` }, null, 2));
    manifest.oldSessionId = old.session_id; manifest.capturedAt = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ syntheticOnly: true, mode, originalPending: true, queuedActions: 0, databaseWrites: 0, linkSavedToIgnoredLocalFile: true }));
    return;
  }
  assert.equal(old.session_id, manifest.oldSessionId, "Verify the exact captured old claim, not a replacement session");
  assert.ok(old.revoked_at, "Original pending claim was not revoked");
  if (mode === "replacement-link" || mode === "verify-onboarding") {
    const second = await rows(manifest.numbers[1]); assert.ok(second.length > 0);
    const replacement = mode === "replacement-link" ? second[0] : second.find(row => row.session_id === manifest.replacementSessionId);
    assert.ok(replacement, "The exact captured replacement claim is required");
    assert.notEqual(replacement.user_id, old.user_id);
    assert.ok(second.every(row => row.user_id === replacement.user_id));
    await noJobs([old.user_id, replacement.user_id]);
    const state = await emptyAccount(replacement.user_id);
    if (mode === "replacement-link") {
      assert.equal(second.length, 1, "Issue only for the original existing replacement pending session");
      assert.equal(replacement.phone_verified_at, null); assert.equal(replacement.activated_at, null); assert.equal(replacement.revoked_at, null);
      assert.ok(replacement.expires_at.getTime() > Date.now());
      assert.ok(replacement.created_at.getTime() > Date.now() - 15 * 60_000, "Replacement claim is too old for normal single-use redemption");
      assert.equal(state.setupStatus, "new");
      if (manifest.replacementSessionId) assert.equal(manifest.replacementSessionId, replacement.session_id);
      const token = issueActionToken({ userId: replacement.user_id, sessionId: replacement.session_id, scope: "account:signin" }, Buffer.alloc(32, 7).toString("base64"));
      await mkdir(resolve(folder, "private"), { recursive: true });
      await writeFile(resolve(folder, "private/replacement-signin.local.json"), JSON.stringify({ syntheticOnly: true, fixtureIssuedNotSms: true, signInUrl: `${manifest.origin}/api/auth/phone?token=${token}` }, null, 2));
      manifest.replacementSessionId = replacement.session_id; manifest.replacementCapturedAt = new Date().toISOString();
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      const result = { syntheticOnly: true, fixtureIssuedNotSms: true, mode, checkedAt: new Date().toISOString(), replacementPending: true, ...state, queuedActions: 0, databaseWrites: 0, linkSavedToIgnoredLocalFile: true };
      if (!existsSync(resolve(folder, "replacement-baseline.json"))) await writeFile(resolve(folder, "replacement-baseline.json"), JSON.stringify(result, null, 2), { flag: "wx" });
      console.log(JSON.stringify(result));
      return;
    }
    assert.equal(second.length, 2, "Normal redemption activates the original claim and creates exactly one browser session");
    assert.ok(replacement.phone_verified_at); assert.ok(replacement.activated_at); assert.equal(replacement.revoked_at, null);
    const browser = second.find(row => row.session_id !== replacement.session_id);
    assert.ok(browser?.activated_at); assert.equal(browser.revoked_at, null); assert.ok(browser.expires_at.getTime() > Date.now());
    assert.ok(["complete", "skipped"].includes(state.setupStatus), "Finish or explicitly skip the UI setup before post-onboarding verification");
    const result = { syntheticOnly: true, fixtureIssuedNotSms: true, mode, checkedAt: new Date().toISOString(), exactReplacementClaimActivated: true, distinctBrowserSession: true, originalAbandonedClaimStillRevoked: true, ...state, queuedActions: 0, inspectedAccounts: 2, databaseWrites: 0 };
    await writeFile(resolve(folder, "replacement-onboarding-results.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    return;
  }
  const second = await rows(manifest.numbers[1]); assert.equal(second.length, 1, "Replacement must have one distinct pending session");
  const replacement = second[0];
  assert.notEqual(replacement.user_id, old.user_id); assert.equal(replacement.phone_verified_at, null);
  assert.equal(replacement.activated_at, null); assert.equal(replacement.revoked_at, null); assert.ok(replacement.expires_at.getTime() > Date.now());
  await noJobs([old.user_id, replacement.user_id]);
  const result = { syntheticOnly: true, checkedAt: new Date().toISOString(), originalSessionRevoked: true, originalSessionUnactivated: true, replacementPending: true, queuedActions: 0, inspectedAccounts: 2, databaseWrites: 0 };
  await writeFile(resolve(folder, "pending-state-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error("Synthetic rehearsal assertion failed; inspect only this pair's local metadata and stop the rehearsal."); process.exitCode = 1; }).finally(() => pool.end());

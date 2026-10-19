/** Real local signup/logout/late-link routes. Requires the pending-only loopback stub. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { issueActionToken } from "../../src/server/security/action-token";

const base = "http://localhost:3101";
const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 1 });
const database = drizzle(pool, { schema });
const key = Buffer.alloc(32, 7).toString("base64");
const run = randomUUID();
async function unusedPhone() {
  const existing = new Set((await database.select({ phone: schema.users.phoneE164 }).from(schema.users)).map(row => row.phone));
  const phone = Array.from({ length: 90 }, (_, index) => `+120255501${String(index).padStart(2, "0")}`).find(phone => !existing.has(phone));
  assert.ok(phone, "No unused reserved synthetic phone remains");
  return phone;
}
async function signup() {
  const phone = await unusedPhone();
  const response = await fetch(`${base}/api/early-access`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json", "User-Agent": `Tempo isolated waiting QA ${run}` }, body: JSON.stringify({ countryCode: "US", callingCode: "+1", areaCode: "202", subscriberNumber: phone.slice(-7), consent: true }) });
  assert.equal(response.status, 202, "Start the candidate with --signup-stub and loopback stub before this test");
  const payload = await response.json();
  assert.equal(payload.onboarding.alreadyVerified, false);
  assert.equal(payload.onboarding.verificationSent, false);
  assert.equal(payload.onboarding.signInLinkQueued, false);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const tokenHash = createHash("sha256").update(cookie.slice("tempo_session=".length)).digest("hex");
  const [session] = await database.select().from(schema.webSessions).where(eq(schema.webSessions.tokenHash, tokenHash));
  assert.ok(session); assert.equal(session.activatedAt, null); assert.equal(session.revokedAt, null);
  const actions = await database.select({ id: schema.scheduledActions.id }).from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, session.userId));
  assert.equal(actions.length, 0, "Shared pending signup must not create dispatchable actions");
  return { cookie, session, phone };
}
async function account(cookie: string) {
  const response = await fetch(`${base}/api/account/me`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return (await response.json()).account;
}
async function main() {
  const original = await signup();
  assert.equal((await account(original.cookie)).phoneVerified, false);
  const oldLinkToken = issueActionToken({ userId: original.session.userId, sessionId: original.session.id, scope: "account:signin" }, key);
  const rejected = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: original.cookie, Origin: "https://untrusted.invalid" } });
  assert.equal(rejected.status, 403);
  let [current] = await database.select().from(schema.webSessions).where(eq(schema.webSessions.id, original.session.id));
  assert.equal(current.revokedAt, null);
  assert.equal((await account(original.cookie)).phoneVerified, false);
  console.log("PASS rejected logout retains the pending session for recovery retry (real foreign-origin HTTP 403)");
  const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: original.cookie, Origin: base } });
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/i);
  [current] = await database.select().from(schema.webSessions).where(eq(schema.webSessions.id, original.session.id));
  assert.ok(current.revokedAt); assert.equal(await account(original.cookie), null);
  console.log("PASS successful reset revokes the exact original pending claim and clears its cookie");
  const replacement = await signup();
  const late = await fetch(`${base}/api/auth/phone`, { method: "POST", redirect: "manual", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", Cookie: replacement.cookie }, body: new URLSearchParams({ token: oldLinkToken }) });
  assert.equal(late.status, 400); assert.equal(late.headers.get("set-cookie"), null);
  const replacementAccount = await account(replacement.cookie);
  assert.equal(replacementAccount.phoneLast4, replacement.phone.slice(-4)); assert.equal(replacementAccount.phoneVerified, false);
  [current] = await database.select().from(schema.webSessions).where(eq(schema.webSessions.id, original.session.id));
  assert.equal(current.activatedAt, null); assert.ok(current.revokedAt);
  console.log("PASS late original-session sign-in link is rejected and cannot replace the new pending account");
  console.log("PASS real local signup/logout/late-link routes; two fresh synthetic accounts; zero scheduled actions; no bearer output; no browser or carrier claim");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());

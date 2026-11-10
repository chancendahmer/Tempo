/** Real local HTTP/PG ownership regression. Synthetic accounts only; no provider paths. */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { WebSessionService } from "../../src/server/security/web-session";
import { issueActionToken } from "../../src/server/security/action-token";
import { decryptField } from "../../src/server/security/field-encryption";

assert.equal(process.argv.length, 2, "No alternate host/database arguments allowed");
for (const name of Object.keys(process.env)) if (/^PG/i.test(name)) delete process.env[name];
process.env.PGPASSFILE = "NUL";
const base = "http://localhost:3103";
const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 2, connectionTimeoutMillis: 3000, query_timeout: 10000 });
const db = drizzle(pool, { schema });
const key = Buffer.alloc(32, 7).toString("base64"); // Public synthetic fixture key used by existing local activation helpers.
const run = randomUUID();
const owned: { id: string; phone: string }[] = [];
const outcomes: { check: string; status?: number }[] = [];
type Actor = { id: string; cookie: string; owner: string; marker: string };
const allowed = new Set(["/api/auth/phone", "/api/auth/logout", "/api/account/me", "/api/account/workspace", "/api/account/setup", "/api/account/feedback"]);
async function http(path: string, init?: RequestInit) {
  const url = new URL(path, base);
  assert.equal(url.origin, base); assert.ok(allowed.has(url.pathname));
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
  return response;
}
function pass(check: string, status?: number) { outcomes.push({ check, ...(status === undefined ? {} : { status }) }); }
async function read(actor: Actor, path = "/api/account/workspace") {
  const response = await http(path, { headers: { Cookie: actor.cookie } });
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}
async function write(actor: Actor, route: string, body: object, owner: string | null = actor.owner) {
  return http(`/api/account/${route}`, { method: route === "me" ? "PUT" : "POST", headers: {
    Cookie: actor.cookie, Origin: base, "Content-Type": "application/json", ...(route !== "me" && owner ? { "x-tempo-account": owner } : {}),
  }, body: JSON.stringify(body) });
}
async function actor(label: string): Promise<Actor> {
  const phone = `+1999${randomInt(1000000, 9999999)}`;
  const [user] = await db.insert(schema.users).values({ phoneE164: phone, displayName: `Owner HTTP ${label}`, onboardingState: "complete", proactiveOptIn: false, timezone: "America/New_York" }).returning();
  owned.push({ id: user.id, phone });
  const session = await new WebSessionService(db).create(user.id);
  const token = issueActionToken({ userId: user.id, scope: "account:signin", sessionId: session.id }, key);
  const pending = await http("/api/account/workspace", { headers: { Cookie: `tempo_session=${session.token}` } });
  assert.equal(pending.status, 401);
  const preview = await http(`/api/auth/phone?token=${encodeURIComponent(token)}`);
  assert.equal(preview.status, 200);
  assert.equal((await db.select().from(schema.webSessions).where(eq(schema.webSessions.id, session.id)))[0].activatedAt, null);
  const redeem = () => http("/api/auth/phone", { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  const activated = await redeem(); assert.equal(activated.status, 303);
  const cookie = activated.headers.get("set-cookie")!.split(";")[0];
  assert.match(cookie, /^tempo_session=/); assert.equal((await redeem()).status, 400);
  const result = { id: user.id, cookie, owner: "", marker: `OWNER_${label}_${run}` };
  result.owner = (await read(result)).cacheKey; assert.match(result.owner, /^[a-f0-9]{64}$/);
  pass(`${label}: pending denied, link preview read-only, normal activation and single-use replay verified`);
  return result;
}
async function durable(actor: Actor) {
  return {
    user: await db.select().from(schema.users).where(eq(schema.users.id, actor.id)),
    items: await db.select().from(schema.lifeItems).where(eq(schema.lifeItems.userId, actor.id)),
    receipts: await db.select().from(schema.lifeActionReceipts).where(eq(schema.lifeActionReceipts.userId, actor.id)),
    feedback: await db.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.userId, actor.id)),
    limits: await db.select().from(schema.rateLimitBuckets).where(inArray(schema.rateLimitBuckets.key, ["workspace-write", "setup-write", "feedback-write"].map(prefix => `${prefix}:${actor.id}`))),
  };
}
async function main() {
  let failure = false;
  try {
    assert.equal((await http("/api/account/me")).status, 200);
    const a = await actor("A"), b = await actor("B"); assert.notEqual(a.owner, b.owner);
    const aNote = { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: a.marker, body: "Private synthetic A note" } };
    assert.equal((await write(a, "workspace", aNote)).status, 200);
    const aBefore = await durable(a), bBefore = await durable(b);
    for (const expected of [a.owner, null]) {
      const attempts = [
        { route: "workspace", body: { ...aNote, id: randomUUID() } },
        { route: "setup", body: { action: "save", displayName: a.marker, coachingTone: "direct", showStreak: false } },
        { route: "feedback", body: { requestId: randomUUID(), type: "problem", section: "tasks", impact: "slowed", detail: a.marker, followUpConsent: false } },
        { route: "me", body: { displayName: a.marker, profileInstructions: a.marker, ...(expected ? { expectedCacheKey: expected } : {}) } },
      ];
      for (const attempt of attempts) {
        const response = await write(b, attempt.route, attempt.body, expected);
        assert.equal(response.status, 409, `${attempt.route} stale/missing owner must fail`);
        if (attempt.route !== "me") assert.equal((await response.json()).code, "account_changed");
        pass(`${attempt.route}: ${expected ? "stale A owner with B cookie" : "missing owner"} rejected`, response.status);
      }
    }
    assert.deepEqual(await durable(a), aBefore); assert.deepEqual(await durable(b), bBefore);
    pass("All eight owner rejections leave A/B records, receipts and write-limiter buckets unchanged");
    const bNote = { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: b.marker, body: "Synthetic B note" } };
    const first = await write(b, "workspace", bNote), again = await write(b, "workspace", bNote);
    assert.equal(first.status, 200); assert.equal(again.status, 200);
    const firstSaved = await first.json();
    assert.equal(firstSaved.cacheKey, b.owner);
    assert.deepEqual(firstSaved, await again.json());
    assert.equal((await db.select().from(schema.lifeItems).where(and(eq(schema.lifeItems.userId, b.id), eq(schema.lifeItems.id, bNote.id)))).length, 1);
    assert.equal((await db.select().from(schema.lifeActionReceipts).where(eq(schema.lifeActionReceipts.userId, b.id))).length, 1);
    pass("Current B owner workspace save and duplicate retry retain exactly one item and receipt", 200);
    const foreign = await write(b, "workspace", { ...aNote, version: 1, data: { ...aNote.data, title: "Foreign edit forbidden" } });
    assert.equal(foreign.status, 409); assert.deepEqual(await durable(a), aBefore);
    pass("Valid B header cannot edit A's saved record", 409);
    const setup = { action: "save", displayName: b.marker, coachingTone: "gentle", showStreak: false };
    for (let i = 0; i < 2; i++) {
      const response = await write(b, "setup", setup); assert.equal(response.status, 200);
      assert.equal((await response.json()).cacheKey, b.owner);
    }
    const setupRead = await read(b, "/api/account/setup");
    assert.equal(setupRead.cacheKey, b.owner); assert.equal(setupRead.setup.coachingTone, "gentle"); assert.equal(setupRead.setup.showStreak, false);
    pass("Current B setup and same-content repeat persist intended values", 200);
    const profile = { displayName: `${b.marker}_profile`, profileInstructions: "Synthetic B instructions", expectedCacheKey: b.owner };
    for (let i = 0; i < 2; i++) {
      const response = await write(b, "me", profile); assert.equal(response.status, 200);
      assert.equal((await response.json()).account.cacheKey, b.owner);
    }
    const profileRead = (await read(b, "/api/account/me")).account;
    assert.equal(profileRead.cacheKey, b.owner); assert.equal(profileRead.displayName, profile.displayName); assert.equal(profileRead.profileInstructions, profile.profileInstructions);
    const [persisted] = await db.select().from(schema.users).where(eq(schema.users.id, b.id));
    assert.equal(persisted.displayName, profile.displayName); assert.equal(persisted.profileInstructions, profile.profileInstructions); assert.equal(persisted.coachingTone, "gentle");
    pass("Current B profile and repeat persist only B's name/instructions", 200);
    const feedback = { requestId: randomUUID(), type: "problem", section: "tasks", impact: "minor", detail: b.marker, followUpConsent: false };
    const reports = [];
    for (let i = 0; i < 2; i++) { const response = await write(b, "feedback", feedback); assert.equal(response.status, 201); reports.push(await response.json()); }
    assert.deepEqual(reports[0], reports[1]); assert.equal(reports[0].cacheKey, b.owner);
    const rows = await db.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.userId, b.id));
    assert.equal(rows.length, 1); assert.equal(rows[0].requestId, feedback.requestId); assert.equal(rows[0].id, reports[0].receipt.id);
    assert.equal(decryptField(rows[0].encryptedDetail!, key), b.marker);
    assert.equal((await db.select().from(schema.rateLimitBuckets).where(eq(schema.rateLimitBuckets.key, `feedback-write:${b.id}`)))[0].count, 1);
    pass("B feedback duplicate retry returns the same receipt, one encrypted record and one limiter consumption", 201);
    assert.deepEqual(await durable(a), aBefore);
    const projected = JSON.stringify(await read(b)); assert.ok(projected.includes(b.marker)); assert.ok(!projected.includes(a.marker));
    pass("Current B retrieval includes B data, excludes A marker; A durable records remain unchanged");
    const observedSession = (await read(b, "/api/account/me")).sessionKey;
    assert.match(observedSession, /^[a-f0-9]{64}$/);
    const previousSession = (await read(a, "/api/account/me")).sessionKey;
    assert.notEqual(previousSession, observedSession);
    const sessionBefore = await db.select({ id: schema.webSessions.id, revokedAt: schema.webSessions.revokedAt }).from(schema.webSessions).where(eq(schema.webSessions.userId, b.id));
    for (const proof of [null, previousSession]) {
      const denied = await http("/api/auth/logout", { method: "POST", headers: { Cookie: b.cookie, Origin: base, ...(proof ? { "x-tempo-session": proof } : {}) } });
      assert.equal(denied.status, 409); assert.equal((await denied.json()).code, "session_changed"); assert.equal(denied.headers.get("set-cookie"), null);
    }
    assert.deepEqual(await db.select({ id: schema.webSessions.id, revokedAt: schema.webSessions.revokedAt }).from(schema.webSessions).where(eq(schema.webSessions.userId, b.id)), sessionBefore);
    assert.equal((await read(b, "/api/account/me")).account.cacheKey, b.owner);
    pass("Missing or stale A logout proof with B cookie never revokes B or clears its cookie", 409);
    const logout = await http("/api/auth/logout", { method: "POST", headers: { Cookie: b.cookie, Origin: base, "x-tempo-session": observedSession } }); assert.equal(logout.status, 200);
    for (const route of ["workspace", "setup", "feedback", "me"]) assert.equal((await write(b, route, route === "me" ? profile : {})).status, 401);
    pass("Revoked B cookie cannot write any of the four routes", 401);
  } catch (error) { failure = true; throw error; }
  finally {
    for (const account of owned) {
      const [row] = await db.select({ id: schema.users.id, phone: schema.users.phoneE164 }).from(schema.users).where(eq(schema.users.id, account.id));
      assert.ok(row && row.phone === account.phone && /^\+1999\d{7}$/.test(row.phone), "Refusing cleanup of a non-owned synthetic account");
      await db.delete(schema.rateLimitBuckets).where(inArray(schema.rateLimitBuckets.key, ["workspace-write", "setup-write", "feedback-write"].map(prefix => `${prefix}:${account.id}`)));
      await db.delete(schema.users).where(and(eq(schema.users.id, account.id), eq(schema.users.phoneE164, account.phone)));
      assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, account.id))).length, 0);
    }
    await pool.end();
    await writeFile("qa/pilot-2026-10-22/account-owner-http.json", JSON.stringify({ passed: !failure, run, scope: "real local HTTP and PostgreSQL; synthetic accounts; no browser/provider calls", base, database: "127.0.0.1:55437/tempo_ui_release", checks: outcomes, cleanedOwnedAccounts: owned.length }, null, 2) + "\n");
  }
}
main().then(() => console.log(JSON.stringify({ passed: true, checks: outcomes.length, cleanedOwnedAccounts: owned.length }))).catch(() => { console.error("Local ownership regression failed; partial sanitized evidence records completed checks."); process.exitCode = 1; });

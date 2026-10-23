/** Synthetic local HTTP/PostgreSQL acceptance; no providers or populated environment files. */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { WebSessionService } from "../../src/server/security/web-session";
import { issueActionToken } from "../../src/server/security/action-token";
import { readHomePreferences } from "../../src/server/domain/home-preferences";
import type { WorkspaceAction } from "../../src/server/db/repositories/workspace-repository";
import type { Workspace } from "../../src/app/workspace/workspace-data";

const base = "http://localhost:3103";
assert.equal(process.argv[2] ?? base, base, "Only exact http://localhost:3103 is allowed");
const databaseUrl = "postgresql://postgres@127.0.0.1:55437/tempo_ui_release";
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const database = scopedDatabase(drizzle(pool, { schema }));
const testKey = Buffer.alloc(32, 7).toString("base64");
const directory = resolve("qa/adaptive-followthrough");
type Actor = { id: string; cookie: string; cacheKey?: string };
const checks: string[] = [];
function pass(label: string) { checks.push(label); console.log(`PASS ${label}`); }

async function actor(displayName: string): Promise<Actor> {
  const now = new Date();
  const [user] = await database.insert(schema.users).values({
    phoneE164: `+1999${randomInt(1000000, 9999999)}`, displayName, timezone: "America/New_York",
    onboardingState: "complete", phoneVerifiedAt: now, profileCompletedAt: now,
    proactiveOptIn: false, profileInstructions: "Synthetic isolated QA account; no carrier or model calls.",
  }).returning();
  const session = await new WebSessionService(database).create(user.id);
  const token = issueActionToken({ userId: user.id, scope: "account:signin", sessionId: session.id }, testKey);
  assert.equal((await fetch(`${base}/api/account/workspace`, { headers: { Cookie: `tempo_session=${session.token}` } })).status, 401);
  const preview = await fetch(`${base}/api/auth/phone?${new URLSearchParams({ token })}`, { redirect: "manual" });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Open my dashboard/);
  const [pending] = await database.select().from(schema.webSessions).where(eq(schema.webSessions.id, session.id));
  assert.equal(pending.activatedAt, null);
  const redeem = () => fetch(`${base}/api/auth/phone`, {
    method: "POST", redirect: "manual", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  const response = await redeem();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${base}/workspace`);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=lax/i);
  assert.equal((await redeem()).status, 400);
  pass(`${displayName}: inactive denied, preview read-only, normal activation, replay denied`);
  return { id: user.id, cookie: cookie.split(";")[0] };
}
async function read(who: Actor): Promise<Workspace> {
  const response = await fetch(`${base}/api/account/workspace`, { headers: { Cookie: who.cookie }, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json() as Workspace;
  assert.ok(body.cacheKey); who.cacheKey = body.cacheKey;
  return body;
}
async function submit(who: Actor, input: WorkspaceAction, origin = base) {
  if (!who.cacheKey) await read(who);
  const response = await fetch(`${base}/api/account/workspace`, {
    method: "POST", redirect: "manual", headers: { "x-tempo-account": who.cacheKey!, Cookie: who.cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  return { status: response.status, body: await response.json() as { message?: string; error?: string } };
}
async function action(who: Actor, input: WorkspaceAction, status = 200) {
  const response = await submit(who, input);
  assert.equal(response.status, status, `${input.action}: ${JSON.stringify(response.body)}`);
  return response;
}
async function main() {
  await mkdir(directory, { recursive: true });
  const identity = await pool.query<{ name: string }>("select current_database() as name");
  assert.equal(identity.rows[0].name, "tempo_ui_release");
  assert.equal((await fetch(`${base}/api/account/workspace`, { redirect: "manual" })).status, 401);
  const riley = await actor("QA Riley"), other = await actor("QA Riley Isolation");
  const empty = await read(riley), isolatedBefore = await read(other);
  for (const key of ["tasks", "goals", "items", "reminders", "messages", "busy"] as const) assert.deepEqual(empty[key], []);
  assert.equal(empty.calendar, null); assert.equal(empty.profile.proactiveOptIn, false);
  const defaults = readHomePreferences(undefined);
  assert.deepEqual(empty.homePreferences, defaults);
  pass("Fresh signed-in account has default adaptive Home preferences and no sample records");

  const desired = { pinned: "auto" as const, morningTime: "07:30", dinnerTime: "18:30", eveningTime: "21:00", workoutLeadMinutes: 30 };
  const preferences: WorkspaceAction = { action: "home_preferences", expected: defaults, preferences: desired };
  await action(riley, preferences);
  assert.deepEqual((await read(riley)).homePreferences, desired);
  await action(riley, preferences, 409);
  assert.deepEqual((await read(riley)).homePreferences, desired);
  pass("Home times/lead persist; stale repeated preference submission returns 409 without overwrite");
  const contenders = ["meal", "workout"] as const;
  const raced = await Promise.all(contenders.map(pinned => submit(riley, { action: "home_preferences", expected: desired, preferences: { ...desired, pinned } })));
  assert.deepEqual(raced.map(result => result.status).sort(), [200, 409]);
  const winner = contenders[raced.findIndex(result => result.status === 200)];
  assert.deepEqual((await read(riley)).homePreferences, { ...desired, pinned: winner });
  await action(riley, { action: "home_preferences", expected: { ...desired, pinned: winner }, preferences: desired });
  assert.deepEqual((await read(riley)).homePreferences, desired);
  pass("Concurrent preference edits serialize: one succeeds, one conflicts; latest expected state can update");
  assert.equal((await submit(riley, { action: "home_preferences", expected: desired, preferences: { ...desired, pinned: "evening" } }, "https://untrusted.invalid")).status, 403);
  await action(other, { action: "home_preferences", expected: desired, preferences: { ...desired, pinned: "focus" } }, 409);
  assert.deepEqual((await read(other)).homePreferences, defaults);
  assert.deepEqual((await read(riley)).homePreferences, desired);
  pass("Foreign origin and stale other-account preference writes preserve both accounts");

  const create: WorkspaceAction = { action: "task", requestId: randomUUID(), command: { type: "create_task", title: "Write a short project outline", estimatedMinutes: 20 } };
  const created = await Promise.all([submit(riley, create), submit(riley, create), submit(riley, create)]);
  assert.ok(created.every(response => response.status === 200));
  let workspace = await read(riley);
  assert.equal(workspace.tasks.length, 1);
  const task = workspace.tasks[0];
  pass("Three concurrent identical task creates persist exactly one task");
  const presentation: WorkspaceAction = { action: "task_presentation", taskId: task.id, expectedTitle: task.title, category: "personal", focusMinutes: 7 };
  await action(riley, presentation); await action(riley, presentation);
  workspace = await read(riley);
  const expectedPresentation = { category: "personal", focusMinutes: 7, source: "manual", title: task.title };
  assert.deepEqual(workspace.tasks[0].presentation, expectedPresentation);
  await action(riley, { ...presentation, expectedTitle: "A stale title" }, 409);
  await action(riley, { ...presentation, focusMinutes: 0 }, 400);
  await action(other, presentation, 409);
  assert.deepEqual((await read(riley)).tasks[0].presentation, expectedPresentation);
  pass("Manual category/timer persist across reads/repeats; stale, invalid and foreign edits are rejected");

  await action(riley, { action: "task", requestId: randomUUID(), command: { type: "create_task", title: "Pack a bag for tomorrow", estimatedMinutes: 5 } });
  const second = (await read(riley)).tasks.find(row => row.id !== task.id)!;
  const start: WorkspaceAction = { action: "task", requestId: randomUUID(), command: { type: "start_task", taskId: task.id }, focusMinutes: 7 };
  await action(other, { ...start, requestId: randomUUID() }, 409);
  const startAt = Date.now();
  const starts = await Promise.all([submit(riley, start), submit(riley, start), submit(riley, start)]);
  assert.ok(starts.every(response => response.status === 200));
  workspace = await read(riley);
  const running = workspace.tasks.find(row => row.id === task.id)!;
  assert.equal(running.status, "in_progress"); assert.ok(running.startedAt);
  const focuses = workspace.items.filter(item => item.data.kind === "focus");
  assert.equal(focuses.length, 1);
  const focus = focuses[0]; assert.equal(focus.data.kind, "focus");
  if (focus.data.kind !== "focus") throw new Error("Missing persisted focus");
  assert.equal(focus.data.taskId, task.id); assert.equal(focus.data.remaining, 420); assert.ok(focus.data.endsAt);
  assert.ok(Date.parse(focus.data.endsAt) >= startAt + 420000 && Date.parse(focus.data.endsAt) <= Date.now() + 420000);
  await action(riley, { ...start, focusMinutes: 9 }, 409);
  await action(riley, { action: "task", requestId: randomUUID(), command: { type: "start_task", taskId: second.id }, focusMinutes: 5 }, 409);
  await action(riley, presentation, 409);
  await action(other, { action: "save", id: focus.id, version: focus.version, data: { ...focus.data, remaining: 1 } }, 409);
  assert.deepEqual((await read(riley)).items.find(item => item.id === focus.id), focus);
  pass("Concurrent Start persists one running task and one seven-minute focus; changed replay/second focus/foreign update rejected");

  const [storedTask] = await database.select().from(schema.tasks).where(and(eq(schema.tasks.id, task.id), eq(schema.tasks.userId, riley.id)));
  const [storedFocus] = await database.select().from(schema.lifeItems).where(and(eq(schema.lifeItems.id, focus.id), eq(schema.lifeItems.userId, riley.id)));
  const [storedUser] = await database.select().from(schema.users).where(eq(schema.users.id, riley.id));
  assert.equal(storedTask.status, "in_progress"); assert.deepEqual(storedTask.presentation, expectedPresentation);
  assert.deepEqual(storedFocus.data, focus.data);
  assert.deepEqual(readHomePreferences(storedUser.workspacePreferences.home), desired);
  const isolatedAfter = await read(other);
  assert.deepEqual(isolatedAfter.tasks, isolatedBefore.tasks); assert.deepEqual(isolatedAfter.items, isolatedBefore.items);
  assert.deepEqual(isolatedAfter.messages, isolatedBefore.messages); assert.equal(isolatedAfter.profile.proactiveOptIn, false);
  const jobs = await database.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, riley.id));
  assert.equal(jobs.length, 0, "This workflow must not queue model, SMS, or provider work");
  pass("Independent PostgreSQL reads match HTTP state; isolation account unchanged; no scheduled provider work");

  const browserSession = await new WebSessionService(database).create(riley.id);
  const browserToken = issueActionToken({ userId: riley.id, scope: "account:signin", sessionId: browserSession.id }, testKey);
  await writeFile(resolve(directory, "local-sign-in.json"), JSON.stringify({
    base, userId: riley.id, displayName: "QA Riley", generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    signInUrl: `${base}/api/auth/phone?${new URLSearchParams({ token: browserToken })}`,
  }, null, 2));
  await writeFile(resolve(directory, "authenticated-home-results.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), base, database: "127.0.0.1:55437/tempo_ui_release", checks,
    accountId: riley.id, isolationAccountId: other.id, preferences: desired, taskId: task.id, focusId: focus.id,
    runningTask: { title: task.title, minutes: 7 }, providerJobs: jobs.length,
    limits: "Synthetic local accounts, normal activation, HTTP and PostgreSQL checks only; no browser or live provider claim.",
  }, null, 2));
  console.log(`PASS ${checks.length} acceptance groups. Fresh QA Riley browser sign-in saved to ignored local-sign-in.json; token not printed.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Local authenticated Home QA failed."); process.exitCode = 1; }).finally(() => pool.end());

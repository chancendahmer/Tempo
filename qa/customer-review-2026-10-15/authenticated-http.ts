/** Real local HTTP + PostgreSQL acceptance checks. No provider calls or browser automation. */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { WebSessionService } from "../../src/server/security/web-session";
import { issueActionToken } from "../../src/server/security/action-token";
import type { Workspace } from "../../src/app/workspace/workspace-data";
import type { LifeItem, SavedLifeItem } from "../../src/server/domain/life-items";
import type { WorkspaceAction } from "../../src/server/db/repositories/workspace-repository";
import type { readWorkspaceLifeItems } from "../../src/server/db/repositories/workspace-life-items";

const base = process.argv[2] ?? "http://localhost:3101";
assert.ok(["http://localhost:3101", "http://localhost:3103"].includes(new URL(base).origin), "Only an isolated local candidate is allowed");
const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 2 });
const database = scopedDatabase(drizzle(pool, { schema }));
const testKey = Buffer.alloc(32, 7).toString("base64");
type Actor = { id: string; cookie: string };
type ActualWorkspace = Workspace & Awaited<ReturnType<typeof readWorkspaceLifeItems>>;
let checks = 0;
function pass(label: string) { checks++; console.log(`PASS ${label}`); }

async function actor(label: string): Promise<Actor> {
  const now = new Date();
  const [user] = await database.insert(schema.users).values({
    phoneE164: `+1999${randomInt(1000000, 9999999)}`, displayName: `Isolated HTTP ${label}`,
    timezone: "America/New_York", onboardingState: "complete", phoneVerifiedAt: now,
    profileCompletedAt: now, proactiveOptIn: false,
    profileInstructions: "Disposable isolated QA account. No carrier or model calls.",
  }).returning();
  const session = await new WebSessionService(database).create(user.id);
  const token = issueActionToken({ userId: user.id, scope: "account:signin", sessionId: session.id }, testKey);
  const pending = await fetch(`${base}/api/account/workspace`, { headers: { Cookie: `tempo_session=${session.token}` } });
  assert.equal(pending.status, 401, "Unactivated session must not expose workspace");
  const preview = await fetch(`${base}/api/auth/phone?token=${token}`);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Open my dashboard/);
  const [stillPending] = await database.select().from(schema.webSessions).where(eq(schema.webSessions.id, session.id));
  assert.equal(stillPending.activatedAt, null, "Link preview must be read-only");
  const redeem = () => fetch(`${base}/api/auth/phone`, { method: "POST", redirect: "manual", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  const response = await redeem();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${base}/workspace`);
  const setCookie = response.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=lax/i);
  assert.equal((await redeem()).status, 400, "Sign-in link must be single use");
  pass(`${label}: normal local sign-in; preview read-only; inactive denied; replay denied`);
  return { id: user.id, cookie: setCookie.split(";")[0] };
}
async function read(who: Actor, date?: string): Promise<ActualWorkspace> {
  const response = await fetch(`${base}/api/account/workspace${date ? `?date=${encodeURIComponent(date)}` : ""}`, { headers: { Cookie: who.cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json() as Promise<ActualWorkspace>;
}
async function action(who: Actor, input: WorkspaceAction, status = 200) {
  const response = await fetch(`${base}/api/account/workspace`, { method: "POST", headers: { Cookie: who.cookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json();
  assert.equal(response.status, status, `${input.action}: ${JSON.stringify(body)}`);
  return body;
}
async function saved(who: Actor, data: LifeItem): Promise<SavedLifeItem> {
  const id = randomUUID();
  await action(who, { action: "save", id, version: 0, data });
  const found = (await read(who)).items.find(item => item.id === id)!;
  assert.ok(found); assert.deepEqual(found.data, data); return found;
}
async function main() {
  assert.equal((await fetch(`${base}/api/account/workspace`)).status, 401);
  const a = await actor("tasks-goals"), b = await actor("life-items"), c = await actor("isolation-history");
  const empty = await read(a);
  for (const key of ["tasks", "goals", "items", "reminders", "messages", "busy"] as const) assert.deepEqual(empty[key], []);
  assert.equal(empty.calendar, null);
  assert.equal(empty.profile.proactiveOptIn, false);
  pass("Empty authenticated account has no fixture tasks/goals/items/reminders/messages/busy times/calendar");
  const wrongOrigin = await fetch(`${base}/api/account/workspace`, { method: "POST", headers: { Cookie: a.cookie, Origin: "https://untrusted.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkins", enabled: true }) });
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await read(a)).profile.proactiveOptIn, false);
  pass("Foreign-origin authenticated write rejected without mutation");

  const goalRequest: WorkspaceAction = { action: "goal", requestId: randomUUID(), command: { type: "create_goal", title: "QA durable goal", description: "Original purpose" } };
  await action(a, goalRequest); await action(a, goalRequest);
  let work = await read(a);
  assert.equal(work.goals.length, 1); const goalId = work.goals[0].id;
  await action(a, { action: "goal", requestId: randomUUID(), command: { type: "update_goal", goalId, patch: { title: "QA durable edited goal", description: "Edited purpose" } } });
  work = await read(a); assert.equal(work.goals[0].description, "Edited purpose");
  pass("Goal create replay is idempotent; edit survives a fresh HTTP workspace read");
  const taskRequest: WorkspaceAction = { action: "task", requestId: randomUUID(), command: { type: "create_task", title: "QA linked task", goalId, estimatedMinutes: 25, dueAt: "2026-10-16T16:00:00.000Z" } };
  await action(a, taskRequest); await action(a, taskRequest);
  work = await read(a); assert.equal(work.tasks.length, 1); const taskId = work.tasks[0].id;
  assert.equal(work.tasks[0].goalId, goalId);
  await action(a, { action: "task", requestId: randomUUID(), command: { type: "update_task", taskId, patch: { title: "QA edited linked task", estimatedMinutes: 30, dueAt: null } } });
  work = await read(a); assert.equal(work.tasks[0].estimatedMinutes, 30); assert.equal(work.tasks[0].dueAt, null);
  await action(a, { action: "task", requestId: randomUUID(), command: { type: "start_task", taskId } });
  assert.equal((await read(a)).tasks[0].status, "in_progress");
  const focus = await saved(a, { kind: "focus", title: "QA focus", taskId, remaining: 1800, endsAt: null });
  await action(a, { action: "finish_focus", id: focus.id, version: focus.version }, 409);
  const stopTask: WorkspaceAction = { action: "stop_focus", requestId: randomUUID(), focus: { id: focus.id, version: focus.version }, task: { id: taskId, startedAt: (await read(a)).tasks[0].startedAt } };
  await action(c, { ...stopTask, requestId: randomUUID() }, 409);
  await action(a, stopTask); await action(a, stopTask);
  work = await read(a); assert.equal(work.tasks[0].status, "not_started"); assert.equal(work.items.some(item => item.id === focus.id), false);
  await action(a, { action: "task", requestId: randomUUID(), command: { type: "start_task", taskId } });
  await action(a, stopTask);
  assert.equal((await read(a)).tasks[0].status, "in_progress", "Replayed stop must not stop the new session");
  const restartedFocus = await saved(a, { kind: "focus", title: "QA restarted focus", taskId, remaining: 1800, endsAt: null });
  pass("Stop task focus keeps unfinished task, clears focus, rejects foreign account, and replay cannot stop a new session");
  await action(a, { action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId } });
  work = await read(a); assert.equal(work.tasks[0].status, "completed"); assert.equal(work.items.some(item => item.id === restartedFocus.id), false);
  await action(a, { action: "task", requestId: randomUUID(), command: { type: "reopen_task", taskId } });
  assert.equal((await read(a)).tasks[0].status, "not_started");
  pass("Linked task create replay/edit/start/focus/complete/reopen persist; completion clears focus atomically");
  await action(a, { action: "goal", requestId: randomUUID(), command: { type: "complete_goal", goalId } });
  assert.equal((await read(a)).goals[0].status, "completed");
  await action(a, { action: "task", requestId: randomUUID(), command: { type: "abandon_task", taskId } });
  assert.equal((await read(a)).tasks.length, 0);
  pass("Goal completion persists; removed task is absent from active/completed workspace list");
  await action(a, { action: "checkins", enabled: true }); assert.equal((await read(a)).profile.proactiveOptIn, true);
  await action(a, { action: "checkins", enabled: false }); assert.equal((await read(a)).profile.proactiveOptIn, false);
  const profile = await fetch(`${base}/api/account/me`, { method: "PUT", headers: { Cookie: a.cookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "QA Updated Name", profileInstructions: "Use short steps." }) });
  assert.equal(profile.status, 200);
  const me = await (await fetch(`${base}/api/account/me`, { headers: { Cookie: a.cookie } })).json();
  assert.equal(me.account.displayName, "QA Updated Name"); assert.equal(me.account.profileInstructions, "Use short steps.");
  pass("Check-in toggle and profile changes persist across independent authenticated reads");

  const note = await saved(b, { kind: "note", title: "QA private note", body: "Keep a durable thought" });
  await action(b, { action: "patch", id: note.id, version: note.version, patch: { kind: "note", body: "Edited thought" } });
  assert.equal(((await read(b)).items.find(item => item.id === note.id)!.data as Extract<LifeItem, {kind: "note"}>).body, "Edited thought");
  await action(b, { action: "save", id: note.id, version: 1, data: { kind: "note", title: "Stale title", body: "Wrong" } }, 409);
  await action(c, { action: "save", id: note.id, version: 2, data: { kind: "note", title: "Foreign update", body: "Wrong" } }, 409);
  await action(c, { action: "delete", id: note.id, version: 2 }, 409);
  assert.equal((await read(c)).items.length, 0);
  assert.equal(((await read(b)).items.find(item => item.id === note.id)!.data as Extract<LifeItem, {kind: "note"}>).body, "Edited thought");
  pass("Brain-dump note persists; stale and foreign-account mutations rejected; no data leaks into other account");

  const stepId = randomUUID();
  let routine = await saved(b, { kind: "routine", title: "QA routine", period: "morning", time: "08:15", steps: [{ id: stepId, title: "Drink water", minutes: 2, completedOn: null }] });
  const routineFocus = await saved(b, { kind: "focus", title: "Water", routineId: routine.id, stepId, remaining: 120, endsAt: null });
  await action(b, { action: "stop_focus", requestId: randomUUID(), focus: { id: routineFocus.id, version: routineFocus.version } });
  const stoppedRoutine = (await read(b)).items.find(item => item.id === routine.id)!;
  assert.ok(stoppedRoutine.data.kind === "routine" && stoppedRoutine.data.steps[0].completedOn === null, "Stopping must not complete the routine step");
  const resumedRoutineFocus = await saved(b, { kind: "focus", title: "Water", routineId: routine.id, stepId, remaining: 120, endsAt: null });
  await action(b, { action: "finish_focus", id: resumedRoutineFocus.id, version: resumedRoutineFocus.version });
  routine = (await read(b)).items.find(item => item.id === routine.id)!;
  assert.equal(routine.data.kind, "routine"); if (routine.data.kind !== "routine") throw new Error("Wrong routine kind");
  const completedOn = routine.data.steps[0].completedOn; assert.ok(completedOn);
  await action(b, { action: "patch", id: routine.id, version: routine.version, patch: { kind: "routine", stepChanges: [{ operation: "update", stepId, minutes: 3 }, { operation: "add", title: "Stretch", minutes: 5 }] } });
  routine = (await read(b)).items.find(item => item.id === routine.id)!;
  if (routine.data.kind !== "routine") throw new Error("Wrong routine kind");
  assert.equal(routine.data.steps.length, 2); assert.equal(routine.data.steps[0].completedOn, completedOn); assert.equal(routine.data.steps[0].minutes, 3);
  await action(b, { action: "save", id: routine.id, version: routine.version, data: { ...routine.data, steps: routine.data.steps.map(step => ({ ...step, completedOn: null })) } });
  pass("Routine focus marks current-day step; edits retain step identity/progress; undo persists");

  const food = await saved(b, { kind: "food", title: "QA unknown lunch", date: "2026-10-15", meal: "Lunch", calories: null, protein: null, carbs: null, fat: null, fiber: null, barcode: "12345678", amount: 150, unit: "g", source: "manual", favorite: true });
  await action(b, { action: "patch", id: food.id, version: food.version, patch: { kind: "food", title: "QA edited lunch", calories: 230, protein: 12 } });
  const foodAfter = (await read(b)).items.find(item => item.id === food.id)!;
  assert.deepEqual(foodAfter.data, { ...food.data, title: "QA edited lunch", calories: 230, protein: 12 });
  const target = await saved(b, { kind: "nutrition_target", title: "QA targets", calories: 2000, protein: null, carbs: null, fat: null, fiber: 25 });
  await action(b, { action: "save", id: randomUUID(), version: 0, data: target.data }, 409);
  await action(b, { action: "patch", id: target.id, version: target.version, patch: { kind: "nutrition_target", calories: 2100, fiber: null } });
  pass("Nutrition unknown values remain null; edit retains barcode/amount/unit/source/favorite; singleton target persists");

  const plan = await saved(b, { kind: "workout_plan", title: "QA strength plan", templateId: "qa-local", sessions: [{ name: "A", minutes: 30, exercises: [{ name: "Squat", dose: "3 × 8" }] }] });
  const workout = await saved(b, { kind: "workout", title: "QA workout", date: "2026-10-15", minutes: 30, activity: "Strength", programId: plan.id, sessionName: "A", notes: "Comfortable effort" });
  await action(b, { action: "patch", id: workout.id, version: workout.version, patch: { kind: "workout", title: "QA edited workout", minutes: 35 } });
  assert.deepEqual((await read(b)).items.find(item => item.id === workout.id)!.data, { ...workout.data, title: "QA edited workout", minutes: 35 });
  await action(b, { action: "patch", id: plan.id, version: plan.version, patch: { kind: "workout_plan", sessions: [{ name: "A revised", minutes: 35, exercises: [{ name: "Squat", dose: "3 × 10" }, { name: "Row", dose: "3 × 10" }] }] } });
  pass("Fitness plan/session/exercises and workout history persist; edits retain program/session/notes metadata");
  await action(b, { action: "delete", id: note.id, version: 2 });
  assert.equal((await read(b)).items.some(item => item.id === note.id), false);
  pass("Brain-dump deletion survives fresh read");

  await saved(b, { kind: "note", title: "AI", body: "A valid short-titled note" });
  await action(b, { action: "task", requestId: randomUUID(), command: { type: "create_task", title: "AI" } }, 400);
  await saved(b, { kind: "note", title: "QA detailed thought", body: "x".repeat(1001) });
  await action(b, { action: "goal", requestId: randomUUID(), command: { type: "create_goal", title: "QA detailed thought", description: "x".repeat(1001) } }, 400);
  pass("Contract boundary confirmed: valid short/long notes need an editor before task/goal conversion (API rejects incompatible fields)");

  const due = new Date(Date.now() + 86400000);
  await database.insert(schema.tasks).values([...Array.from({ length: 205 }, (_, index) => ({ userId: c.id, title: `Old completed ${index}`, status: "completed" as const })), { userId: c.id, title: "ACTIVE_TASK_PRIORITY", status: "not_started" as const }]);
  await database.insert(schema.goals).values([...Array.from({ length: 105 }, (_, index) => ({ userId: c.id, title: `Old completed goal ${index}`, status: "completed" as const })), { userId: c.id, title: "ACTIVE_GOAL_PRIORITY", status: "active" as const }]);
  await database.insert(schema.reminders).values([...Array.from({ length: 205 }, (_, index) => ({ userId: c.id, text: `Old sent ${index}`, remindAt: new Date(Date.now() - (index + 1) * 86400000), timezone: "America/New_York", status: "sent" as const, idempotencyKey: randomUUID() })), { userId: c.id, text: "UPCOMING_REMINDER_PRIORITY", remindAt: due, timezone: "America/New_York", status: "scheduled" as const, idempotencyKey: randomUUID() }]);
  const history = await read(c);
  assert.equal(history.tasks[0].title, "ACTIVE_TASK_PRIORITY"); assert.equal(history.tasks.length, 200); assert.equal(history.tasksTruncated, true);
  assert.equal(history.goals[0].title, "ACTIVE_GOAL_PRIORITY"); assert.equal(history.goals.length, 100); assert.equal(history.goalsTruncated, true);
  assert.equal(history.reminders[0].text, "UPCOMING_REMINDER_PRIORITY"); assert.equal(history.reminders.length, 200); assert.equal(history.remindersTruncated, true);
  const other = await read(b); assert.equal(other.tasks.length, 0); assert.equal(other.goals.length, 0); assert.equal(other.reminders.length, 0);
  const jobs = await database.select({ id: schema.scheduledActions.id }).from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, c.id));
  assert.equal(jobs.length, 0);
  pass("Large histories preserve active tasks/goals/upcoming reminders and flag truncation; other account remains isolated");
  if (process.argv.includes("--history-boundary")) {
    const routineId = randomUUID(), targetId = randomUUID();
    await database.insert(schema.lifeItems).values([
      { id: routineId, userId: c.id, createdAt: new Date("2020-01-01T00:00:00Z"), data: { kind: "routine", title: "OLDER_DAILY_ROUTINE", period: "morning", time: "08:00", steps: [] } },
      { id: targetId, userId: c.id, createdAt: new Date("2020-01-01T00:00:01Z"), data: { kind: "nutrition_target", title: "OLDER_TARGET", calories: 2000, protein: null, carbs: null, fat: null, fiber: null } },
      ...Array.from({ length: 1000 }, (_, index) => ({ id: randomUUID(), userId: c.id, createdAt: new Date(Date.UTC(2025, 0, 1) + index * 1000), data: { kind: "food" as const, title: `Historical food ${index}`, date: "2025-01-01", meal: "Lunch" as const, calories: null, protein: null, carbs: null, fat: null, fiber: null } })),
    ]);
    const boundary = await read(c);
    assert.ok(boundary.items.some(item => item.id === routineId), "Older daily routine must remain available after 1,000 newer food entries");
    assert.ok(boundary.items.some(item => item.id === targetId), "Existing nutrition target must remain available after 1,000 newer food entries");
    assert.equal(boundary.itemCoverage.food.total, 1000); assert.equal(boundary.itemCoverage.food.truncated, true);
    pass("Older durable routine and nutrition target stay available beyond the 1,000-item history boundary");
    const fullDay = await read(c, "2025-01-01");
    assert.equal(fullDay.diaryCoverage?.food.included, 1000); assert.equal(fullDay.diaryCoverage.food.total, 1000); assert.equal(fullDay.diaryCoverage.food.truncated, false);
    await database.insert(schema.lifeItems).values([
      { id: randomUUID(), userId: c.id, createdAt: new Date("2025-02-01T00:00:00Z"), data: { kind: "food", title: "Huge day extra", date: "2025-01-01", meal: "Dinner", calories: 50, protein: null, carbs: null, fat: null, fiber: null } },
      { id: randomUUID(), userId: c.id, createdAt: new Date("2019-01-01T00:00:00Z"), data: { kind: "food", title: "Old day retrievable", date: "2024-01-01", meal: "Dinner", calories: 100, protein: 5, carbs: 10, fat: 4, fiber: 2 } },
    ]);
    const hugeDay = await read(c, "2025-01-01");
    assert.equal(hugeDay.diaryCoverage?.food.included, 1000); assert.equal(hugeDay.diaryCoverage.food.total, 1001); assert.equal(hugeDay.diaryCoverage.food.truncated, true);
    const oldDay = await read(c, "2024-01-01");
    assert.equal(oldDay.diaryCoverage?.food.included, 1); assert.equal(oldDay.diaryCoverage.food.truncated, false);
    assert.ok(oldDay.items.some(item => item.data.kind === "food" && item.data.title === "Old day retrievable"));
    const emptyDay = await read(c, "2030-01-01");
    assert.equal(emptyDay.diaryCoverage?.food.total, 0); assert.equal(emptyDay.diaryCoverage.food.truncated, false);
    const invalidDay = await fetch(`${base}/api/account/workspace?date=2025-99-99`, { headers: { Cookie: c.cookie } });
    assert.equal(invalidDay.status, 400);
    pass("Date-scoped diary retrieves old records and distinguishes complete, empty and truncated days; invalid date rejected");
  }
  console.log(`PASS ${checks} acceptance groups. Real HTTP/PostgreSQL; synthetic disposable accounts; no external provider calls; no rendered-browser claim.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());

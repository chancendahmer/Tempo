/** Authenticated HTTP/PG complement to the independent browser review. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { WorkspaceAction } from "../../src/server/db/repositories/workspace-repository";
import { localDay } from "../../src/server/domain/life-items";
import { localDateTimeToUtc } from "../../src/server/domain/reminder-service";
import { steps, titles } from "./scenario-steps";

assert.equal(process.argv.length, 2);
const root = "qa/pilot-2026-11-10";
const base = "http://localhost:3103";
const runBridge = promisify(execFile);
const runName = `http-${randomUUID().replaceAll("-", "")}`;
const linkPath = `${root}/private/${runName}/local-access.json`;
const bridgeEnv = { ...process.env, TEMPO_QA_RUN: runName };
const outcomes: string[] = [];
let phase = "setup";
type Actor = { cookie: string; owner: string };
type HttpWorkspace = { cacheKey: string; profile: { displayName: string }; tasks: Array<{ id: string; title: string; status: string }>; items: Array<{ id: string; version: number; data: { kind: string; title: string; endsAt?: string | null; remaining?: number } }>; reminders: Array<{ id: string; status: string }>; messages: Array<{ body: string }> };

async function bridge(...args: string[]) {
  const child = await runBridge(process.execPath, ["--import", "tsx", `${root}/account-bridge.ts`, ...args], { timeout: 15000, env: bridgeEnv, windowsHide: true });
  return JSON.parse(child.stdout);
}

async function request(path: string, init?: RequestInit) {
  const url = new URL(path, base);
  assert.equal(url.origin, base);
  assert.ok(["/api/account/workspace", "/api/auth/phone", "/api/auth/logout", "/api/account/me"].includes(url.pathname));
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
}
async function activate(url: string) {
  const address = new URL(url);
  assert.equal(address.origin, base);
  assert.equal(address.pathname, "/api/auth/phone");
  const token = address.searchParams.get("token");
  assert.ok(token);
  assert.equal((await request(address.href)).status, 200);
  const redeem = () => request(address.pathname, { method: "POST", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  const response = await redeem();
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("tempo_session="));
  assert.equal((await redeem()).status, 400);
  const actor = { cookie: cookie!, owner: "" };
  actor.owner = (await workspace(actor)).cacheKey;
  return actor;
}
async function workspace(actor: Actor): Promise<HttpWorkspace> {
  const response = await request("/api/account/workspace", { headers: { Cookie: actor.cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}
async function write(actor: Actor, action: WorkspaceAction, owner = actor.owner, status = 200) {
  const response = await request("/api/account/workspace", { method: "POST", headers: {
    Cookie: actor.cookie, Origin: base, "Content-Type": "application/json", "x-tempo-account": owner,
  }, body: JSON.stringify(action) });
  assert.equal(response.status, status);
  return response.json();
}
function task(actor: Actor, command: Extract<WorkspaceAction, { action: "task" }>["command"], focusMinutes?: number) {
  return write(actor, { action: "task", requestId: randomUUID(), command, focusMinutes });
}
async function save(actor: Actor, data: Extract<WorkspaceAction, { action: "save" }>["data"], sourceRecipeId?: string) {
  const id = randomUUID();
  await write(actor, { action: "save", version: 0, id, data, sourceRecipeId });
  return id;
}
async function turn(step: string, options?: { channel?: "sms" | "web"; actor?: Actor; date?: string; role?: "a" | "b"; duplicate?: boolean }) {
  const channel = options?.channel ?? "sms";
  if (channel === "web") {
    assert.ok(options?.actor && options.date);
    await write(options.actor, { action: "chat", requestId: randomUUID(), text: steps[step].message(options.date) });
  }
  const result = await bridge("turn", step, channel, options?.role ?? "a");
  assert.equal(result.otherAccountUnchanged, true);
  assert.equal(options?.duplicate ? result.duplicate : result.assertionsPassed, true);
  return result as { reply?: string };
}
function verify(condition: unknown) { assert.ok(condition); }

async function main() {
  const { date } = await bridge("init") as { date: string };
  const links = JSON.parse(await readFile(linkPath, "utf8")) as { a: string; b: string };
  const [a, b] = await Promise.all([activate(links.a), activate(links.b)]);
  const [aStart, bStart] = await Promise.all([workspace(a), workspace(b)]);
  verify(aStart.profile.displayName === "QA Ash" && bStart.profile.displayName === "QA Birch");
  verify(aStart.tasks.length === 0 && aStart.items.length === 0 && bStart.items.length === 1);
  outcomes.push("Normal links activate different accounts and reject repeat redemption.");

  phase = "thought and focus";
  await save(a, { kind: "note", title: titles.thought, body: "Ask about an evening session." });
  await turn("thought");
  await turn("thought", { duplicate: true });
  let saved = await workspace(a);
  const linkedTask = saved.tasks.find(item => item.title === titles.thoughtTask)!;
  verify(linkedTask?.status === "not_started");
  await task(a, { type: "start_task", taskId: linkedTask.id }, 6);
  saved = await workspace(a);
  const focus = saved.items.find(item => item.data.kind === "focus")!;
  verify(focus.data.remaining === 360);
  await write(a, { action: "save", id: focus.id, version: focus.version, data: { ...focus.data, kind: "focus", taskId: linkedTask.id, endsAt: null, remaining: 300 } });
  verify((await workspace(a)).items.some(item => item.id === focus.id && item.data.remaining === 300 && item.data.endsAt === null));
  await task(a, { type: "complete_task", taskId: linkedTask.id });
  await turn("thought-read", { channel: "web", actor: a, date });
  outcomes.push("Thought becomes one linked six-minute task after SMS replay. A separate authenticated read sees the paused timer, then web chat reads completion and the surviving thought.");

  phase = "timed task and reminder";
  const [year, month, day] = date.split("-").map(Number);
  const dueAt = localDateTimeToUtc({ year, month, day, hour: 15, minute: 0, second: 0 }, "America/New_York").toISOString();
  await task(a, { type: "create_task", title: titles.timedTask, dueAt });
  await turn("reminder");
  await turn("reminder-move");
  await turn("reminder-move-fresh");
  const timedTask = (await workspace(a)).tasks.find(item => item.title === titles.timedTask)!;
  await task(a, { type: "complete_task", taskId: timedTask.id });
  await turn("reminder-read", { channel: "web", actor: a, date });
  const activeReminder = (await workspace(a)).reminders.find(item => item.status === "scheduled")!;
  await write(a, { action: "remove_reminder", id: activeReminder.id });
  verify((await workspace(a)).reminders.find(item => item.id === activeReminder.id)?.status === "cancelled");
  outcomes.push("Explicit reminder moves first to 1 PM and then to 12:30 PM New York while the 3 PM task is unchanged. Task completion leaves one occurrence pending until a separate cancellation.");

  phase = "meal, shopping, pantry, and food";
  const recipeId = await save(a, { kind: "recipe", title: titles.meal, ingredients: "200 g rice\n1 lemon", instructions: "Cook rice, add lemon.", servings: 2, prepMinutes: 20, favorite: false });
  await save(a, { kind: "meal", title: titles.meal, date, meal: "Dinner", ingredients: "", servings: 4 }, recipeId);
  await save(a, { kind: "grocery", title: titles.grocery, checked: false });
  await save(a, { kind: "pantry", title: "Rice", quantity: 100, unit: "g" });
  await turn("meal");
  const mealRead = await turn("meal-read", { channel: "web", actor: a, date });
  verify(mealRead.reply?.includes("2 portions planned. 100 g rice to buy. 0 saved food logs."));
  outcomes.push("Current meal edits recalculate linked shopping, preserve the manual item and pantry quantity, and keep unlogged consumption separate.");

  phase = "routine progress";
  const today = localDay(new Date(), "America/New_York");
  await save(a, { kind: "routine", title: titles.routine, period: "morning", time: "08:30", steps: [
    { id: randomUUID(), title: "Hang up keys", minutes: 1, completedOn: today },
    { id: randomUUID(), title: "Put shoes away", minutes: 2, completedOn: null },
  ] });
  await turn("routine");
  const routineRead = await turn("routine-read", { channel: "web", actor: a, date });
  verify(routineRead.reply?.includes("Put shoes away (3 min, open); Hang up keys (1 min, checked off)"));
  outcomes.push("Reorder and duration edit retain exact routine step IDs and completion date. Contextual read reports the corrected next step.");

  phase = "workout plans and logs";
  const programId = await save(a, { kind: "workout_plan", title: titles.workoutPlan, templateId: "walking-mobility", sessions: [
    { name: "River stretch", minutes: 8, exercises: [{ name: "Stretch", dose: "8 min" }] },
    { name: "River walk", minutes: 18, exercises: [{ name: "Walk", dose: "18 min" }] },
  ] });
  await turn("workout");
  await save(a, { kind: "workout", title: "River walk", date: today, minutes: 12, activity: "Walk", programId, sessionName: "River walk" });
  const yesterday = localDay(new Date(Date.now() - 86_400_000), "America/New_York");
  await save(a, { kind: "workout", title: "A separate walk", date: yesterday, minutes: 7, activity: "Walk" });
  const workoutRead = await turn("workout-read", { channel: "web", actor: a, date });
  verify(workoutRead.reply?.includes("River walk: planned 18 min; logged 12 min."));
  outcomes.push("Assistant schedules the selected plan session. The shorter actual log keeps its plan link, the future task remains open, and today's retrieval excludes a separate prior-day workout.");

  phase = "removal, stale ownership, and relogin";
  const oldNoteId = await save(a, { kind: "note", title: titles.disposableNote, body: "Synthetic discard." });
  await turn("remove-note");
  const stale: WorkspaceAction = { action: "save", id: oldNoteId, version: 1, data: { kind: "note", title: titles.disposableNote, body: "Old form." } };
  const beforeStale = await workspace(b);
  verify((await write(b, stale, a.owner, 409)).code === "account_changed");
  assert.deepEqual((await workspace(b)).items, beforeStale.items);
  const cedar = await turn("isolation-read", { role: "b" });
  verify(cedar.reply?.includes("only") && !cedar.reply?.includes(titles.thought));
  const rowan = await turn("isolation-read", { role: "a" });
  verify(rowan.reply?.includes(titles.thought) && !rowan.reply?.includes(titles.disposableNote) && !rowan.reply?.includes("Birch"));
  const account = await request("/api/account/me", { headers: { Cookie: a.cookie } });
  const { sessionKey } = await account.json();
  const loggedOut = await request("/api/auth/logout", { method: "POST", headers: { Cookie: a.cookie, Origin: base, "x-tempo-session": sessionKey } });
  assert.equal(loggedOut.status, 200);
  assert.equal((await request("/api/account/workspace", { headers: { Cookie: a.cookie } })).status, 401);
  const refreshed = await runBridge(process.execPath, ["--import", "tsx", `${root}/account-bridge.ts`, "links"], { env: bridgeEnv, timeout: 15000, windowsHide: true });
  verify(refreshed.stdout.startsWith("Fresh links"));
  const newLink = JSON.parse(await readFile(linkPath, "utf8")).a as string;
  const reauthenticated = await activate(newLink);
  const current = await workspace(reauthenticated);
  verify(current.cacheKey === a.owner && current.items.some(item => item.data.title === titles.thought) && !current.items.some(item => item.id === oldNoteId));
  outcomes.push("Removal survives normal sign-out/relogin. Stale A owner with B cookie gets 409, both accounts return only current own notes, and the other account stays unchanged.");
  phase = "owned fixture cleanup";
  verify((await bridge("clean")).removedRunOwnedAccounts === 2);
  outcomes.push("Removed only the two run-owned HTTP fixture accounts and the private sign-in file.");
}

void main().catch((error: unknown) => {
  const frame = error instanceof Error ? error.stack?.match(/http-journeys\.ts:\d+:\d+/)?.[0] : undefined;
  const childFailure = error && typeof error === "object" && "stderr" in error ? String(error.stderr).trim() : "";
  console.error(`Authenticated QA failed during ${phase}${frame ? ` at ${frame}` : ""}. Raw diagnostics withheld.`);
  if (/^Account QA fixture failed(?: at [a-z-]+\.ts:\d+:\d+)?(?: \(SQLSTATE [A-Z0-9]{5}(?: [a-z0-9_]+)?\))?\. Raw diagnostics withheld\.$/.test(childFailure)) console.error(childFailure);
  process.exitCode = 1;
}).finally(async () => {
  const report = { scope: "Authenticated HTTP, real local PostgreSQL, scripted assistant decisions, captured SMS; no rendered browser or provider calls", passed: !process.exitCode, failedPhase: process.exitCode ? phase : null, outcomes };
  await writeFile(`${root}/http-results.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
});

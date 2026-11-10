/** Run-owned browser account fixtures and captured, provider-free assistant turns. */
import { base, databaseUrl, key } from "./fixture-environment";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import type { TaskIntentParser } from "../../src/server/adapters/llm/task-intent-parser";
import { parseSendblueWebhook } from "../../src/server/adapters/sms/sendblue-webhook";
import { TestSmsTransport } from "../../src/server/adapters/sms/sms-transport";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { DrizzleConversationHistoryRepository } from "../../src/server/db/repositories/conversation-history-repository";
import { DrizzleConversationRepository } from "../../src/server/db/repositories/conversation-repository";
import { DrizzleGoalRepository } from "../../src/server/db/repositories/goal-repository";
import { DrizzleItemReviewRepository } from "../../src/server/db/repositories/item-review-repository";
import { LifeAssistant } from "../../src/server/db/repositories/life-assistant";
import { DrizzleMemoryRepository } from "../../src/server/db/repositories/memory-repository";
import { DrizzleMessagingRepository } from "../../src/server/db/repositories/messaging-repository";
import { DrizzleOutboundMessageRepository } from "../../src/server/db/repositories/outbound-message-repository";
import { DrizzleReminderRepository } from "../../src/server/db/repositories/reminder-repository";
import { DrizzleSchedulingRepository } from "../../src/server/db/repositories/scheduling-repository";
import { DrizzleTaskRepository } from "../../src/server/db/repositories/task-repository";
import { WebReplySender } from "../../src/server/db/repositories/web-reply-repository";
import { mutateWorkspace, readWorkspace } from "../../src/server/db/repositories/workspace-repository";
import * as schema from "../../src/server/db/schema";
import { ConversationOrchestrator } from "../../src/server/domain/conversation-orchestrator";
import { MemoryService } from "../../src/server/domain/memory-service";
import { SafeSmsSender } from "../../src/server/domain/outbound-messaging";
import { ScheduledActionRepository } from "../../src/server/jobs/scheduled-action-repository";
import { issueActionToken } from "../../src/server/security/action-token";
import { WebSessionService } from "../../src/server/security/web-session";
import { steps, titles } from "./scenario-steps";

const fixtureMode = process.env.TEMPO_QA_RUN ?? "browser";
const isHttp = /^http-[0-9a-f]{32}$/.test(fixtureMode);
assert.ok(fixtureMode === "browser" || isHttp);
const privateDirectory = "qa/pilot-2026-11-10/private";
const fixturePath = isHttp ? `${privateDirectory}/${fixtureMode}` : privateDirectory;
const directory = resolve(fixturePath);
const manifestPath = resolve(directory, "run.json");
const linkPath = resolve(directory, "local-access.json");
const pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000, query_timeout: 12000 });
const database = scopedDatabase(drizzle(pool, { schema }));
const actorSchema = z.object({ id: z.uuid(), phone: z.string().regex(/^\+120255501\d\d$/) }).strict();
const runSchema = z.object({ id: z.uuid(), date: z.iso.date(), a: actorSchema, b: actorSchema }).strict();
type Run = z.infer<typeof runSchema>;
type Actor = z.infer<typeof actorSchema>;
type Role = "a" | "b";
class FixtureCheck extends Error {}
function location(error: unknown) {
  return error instanceof Error ? error.stack?.match(/(?:[a-z-]+)\.ts:\d+:\d+/)?.[0] : undefined;
}
function errorCode(error: unknown) {
  const cause = error instanceof Error ? error.cause ?? error : error;
  if (!cause || typeof cause !== "object" || !("code" in cause) || typeof cause.code !== "string" || !/^[A-Z0-9]{5}$/.test(cause.code)) return null;
  const constraint = "constraint" in cause && typeof cause.constraint === "string" && /^[a-z0-9_]+$/.test(cause.constraint) ? cause.constraint : "";
  return [cause.code, constraint].filter(Boolean).join(" ");
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new FixtureCheck(message);
}
function marker(run: Pick<Run, "id">, role: Role) { return `Synthetic account QA ${run.id} ${role.toUpperCase()}`; }
function privateNote(run: Run) { return `QA ${isHttp ? "Birch" : "Cedar"}-only ${run.id.slice(0, 8)}`; }

async function issueLinks(run: Run) {
  const service = new WebSessionService(database);
  const links = await Promise.all((["a", "b"] as const).map(async role => {
    const account = run[role];
    const session = await service.create(account.id);
    const token = issueActionToken({ userId: account.id, scope: "account:signin", sessionId: session.id }, key);
    return [role, `${base}/api/auth/phone?token=${encodeURIComponent(token)}`];
  }));
  await writeFile(linkPath, JSON.stringify(Object.fromEntries(links), null, 2) + "\n");
}

async function setup() {
  check(!existsSync(manifestPath), "Run already exists. Use links to issue fresh sign-in links.");
  const id = randomUUID();
  const day = new Date(Date.now() + 2 * 86400000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(day);
  const names = isHttp ? { a: "QA Ash", b: "QA Birch" } : { a: "QA Rowan", b: "QA Cedar" };
  const run = await database.transaction(async tx => {
    const createActor = async (role: Role): Promise<Actor> => {
      for (let suffix = 50; suffix <= 98; suffix++) {
        const phone = `+120255501${suffix}`;
        const [user] = await tx.insert(schema.users).values({
          phoneE164: phone, displayName: names[role], profileInstructions: marker({ id }, role),
          phoneVerifiedAt: new Date(), onboardingState: "complete", proactiveOptIn: false, timezone: "America/New_York",
          workspacePreferences: { setupStatus: "complete", timezoneConfirmedAt: new Date().toISOString() },
        }).onConflictDoNothing({ target: schema.users.phoneE164 }).returning({ id: schema.users.id });
        if (!user) continue;
        await tx.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "synthetic", termsVersion: "synthetic", privacyVersion: "synthetic" });
        return { id: user.id, phone };
      }
      throw new FixtureCheck("No unused reserved fixture numbers in the permitted range.");
    };
    return runSchema.parse({ id, date, a: await createActor("a"), b: await createActor("b") });
  });
  await mkdir(directory, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(run, null, 2) + "\n", { flag: "wx" });
  await mutateWorkspace(run.b.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: privateNote(run), body: "Synthetic private fixture." } }, database);
  await issueLinks(run);
  console.log(JSON.stringify({ setup: true, date, accounts: Object.values(names), links: `${fixturePath}/local-access.json`, carrierDelivery: false }));
}

async function loadRun() {
  const run = runSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  check(run.a.id !== run.b.id && run.a.phone !== run.b.phone, "Fixture accounts must be distinct.");
  for (const role of ["a", "b"] as const) {
    const actor = run[role];
    const [user] = await database.select().from(schema.users).where(and(eq(schema.users.id, actor.id), eq(schema.users.phoneE164, actor.phone)));
    check(user?.profileInstructions === marker(run, role) && !user.proactiveOptIn && user.timezone === "America/New_York", "Account ownership marker or local safety state changed.");
  }
  return run;
}

async function reminderOccurrences(userId: string, reminderId: string) {
  const action = schema.scheduledActions;
  return database.select({ id: action.id, runAt: action.runAt, status: action.status, completedAt: action.completedAt })
    .from(action).where(and(eq(action.userId, userId), eq(action.reminderId, reminderId), eq(action.kind, "deliver_reminder")))
    .orderBy(asc(action.id));
}

async function drive(run: Run, id: keyof typeof steps, channel: "sms" | "web", role: Role) {
  const actor = run[role];
  const step = steps[id];
  check(role === "a" || !step.grants.length, "Writes are available only for the primary fixture.");
  const body = step.message(run.date);
  const providerId = `qa-${run.id}-${role}-${id}`;
  const transport = new TestSmsTransport(`CAPTURED-${providerId}-`);
  const prior = await readWorkspace(actor.id, database);
  const cancelledJourney = id === "reminder-cancel-fresh" || id === "reminder-cancel-read";
  const original = cancelledJourney ? prior.reminders.find(item => item.text === titles.timedTask) : undefined;
  const priorOccurrences = original ? await reminderOccurrences(actor.id, original.id) : [];
  let duplicate = false;
  if (channel === "sms") {
    const event = parseSendblueWebhook({ content: body, is_outbound: false, status: "RECEIVED", message_handle: providerId, from_number: actor.phone, to_number: "+12025550149" });
    check(event.kind === "inbound", "Expected an inbound SMS fixture.");
    ({ duplicate } = await new DrizzleMessagingRepository(database, { PILOT_ADMISSION_MODE: "open", PILOT_INVITED_PHONES: [] }).ingestInbound(event.input));
  }
  const messages = await database.select().from(schema.conversationMessages).where(and(
    eq(schema.conversationMessages.userId, actor.id),
    eq(schema.conversationMessages.body, body),
    channel === "sms" ? eq(schema.conversationMessages.providerMessageSid, providerId) : like(schema.conversationMessages.idempotencyKey, `web-chat:${actor.id}:%`),
  ));
  check(messages.length === 1, channel === "web" ? "Submit the exact fixture prompt once in the authenticated Ask Tempo UI." : "Expected one durable inbound message.");
  const [message] = messages;
  const jobKey = channel === "sms" ? `inbound:sendblue:${providerId}` : `web-process:${message.id}`;
  const jobs = await database.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.userId, actor.id), eq(schema.scheduledActions.idempotencyKey, jobKey)));
  check(jobs.length === 1, "Expected one durable inbound job.");
  const [job] = jobs;
  if (duplicate || job.status === "completed") {
    check(job.status === "completed" && message.status === "processed", "Inbound replay has no completed original.");
    const after = await readWorkspace(actor.id, database);
    check(sameState(prior, after), "Replay changed durable workspace state.");
    check(JSON.stringify(prior.messages) === JSON.stringify(after.messages) && !transport.sent.length, "Replay created another reply.");
    if (cancelledJourney) {
      check(original?.status === "cancelled" && priorOccurrences.some(item => item.status === "cancelled" && item.runAt.getTime() === original.remindAt.getTime()), "Replay lost the cancelled reminder occurrence.");
      check(priorOccurrences.every(item => item.status === "cancelled" || item.status === "completed"), "Replay found deliverable reminder work.");
      assert.deepEqual(await reminderOccurrences(actor.id, original.id), priorOccurrences);
    }
    return { step: id, channel, role, duplicate: true, oneInbound: true, oneInboundJob: true, unchanged: true, noExtraReply: true };
  }
  check(message.status === "received" && job.status === "scheduled", "Expected a fresh inbound message and scheduled job.");
  const reads: string[] = [];
  let parserFailure: unknown;
  const parser: TaskIntentParser = {
    authorizer: { authorize: async () => step.grants.length ? { mode: "write", commands: step.grants } : { mode: "read_only", commands: [] } },
    parse: async input => {
      check(input.message === body && input.execute, "The parser received an unexpected message.");
      check(!JSON.stringify(input).includes(marker(run, role === "a" ? "b" : "a")), "Other account profile reached the parser.");
      if (role === "a") check(!JSON.stringify(input).includes(privateNote(run)), "Cedar's private note reached Rowan's parser context.");
      const execute = input.execute;
      try {
        const reply = await step.run(async command => {
          const result = await execute(command);
          reads.push(command.type);
          return result;
        }, prior, run.date);
        return { kind: "conversation", reply: `[SCRIPTED] ${reply}` };
      } catch (error) {
        parserFailure = error;
        throw error;
      }
    },
  };
  const actions = new ScheduledActionRepository(database);
  check(await actions.markRunning(job.id), "Could not claim the exact fixture job.");
  try {
    const orchestrator = new ConversationOrchestrator(
      new DrizzleConversationRepository(database), new DrizzleTaskRepository(database), new DrizzleGoalRepository(database),
      new DrizzleSchedulingRepository(database), parser,
      channel === "web" ? new WebReplySender(message.id, database) : new SafeSmsSender(new DrizzleOutboundMessageRepository(database), {
        getCapabilities: () => transport.getCapabilities(),
        send: async input => {
          check(input.to === actor.phone, "Captured outbound recipient was not this run's selected account.");
          return transport.send(input);
        },
      }), undefined, undefined, new MemoryService(new DrizzleMemoryRepository(database)), undefined,
      new DrizzleConversationHistoryRepository(database), new DrizzleReminderRepository(database), undefined,
      new LifeAssistant(database), new DrizzleItemReviewRepository(database),
    );
    await orchestrator.process(message.id);
    await actions.markCompleted(job.id);
  } catch (error) {
    await actions.markFailed(job.id, new Error("Synthetic fixture turn failed"));
    throw error;
  }
  if (parserFailure) throw parserFailure;
  const after = await readWorkspace(actor.id, database);
  const replies = channel === "sms" ? transport.sent.map(item => item.body) : after.messages.filter(item => item.direction === "outbound" && !prior.messages.some(before => before.id === item.id)).map(item => item.body);
  check(replies.length === 1, "Expected one captured reply from the selected account.");
  if (role === "a") check(!replies[0].includes(privateNote(run)), "Cedar's note leaked in Rowan's reply.");
  check(reads.length > 0, "No repository-backed tool executed.");
  if (!step.grants.length) check(sameState(prior, after), "Read-only turn changed durable workspace state.");
  step.verify?.(prior, after, run.date);
  if (id.startsWith("reminder")) {
    const currentReminder = after.reminders.find(item => item.text === titles.timedTask);
    check(currentReminder, "The expected owned reminder is absent.");
    const occurrences = await reminderOccurrences(actor.id, currentReminder.id);
    if (cancelledJourney) {
      check(occurrences.every(item => item.status === "cancelled" || item.status === "completed"), "A cancelled reminder still has deliverable work.");
      check(occurrences.some(item => item.status === "cancelled" && item.runAt.getTime() === currentReminder.remindAt.getTime()), "The cancelled reminder occurrence is absent.");
      if (id === "reminder-cancel-fresh") {
        const active = priorOccurrences.filter(item => item.status === "scheduled");
        check(active.length === 1 && active[0].runAt.getTime() === currentReminder.remindAt.getTime(), "The original current occurrence was not uniquely scheduled.");
        const cancelled = occurrences.find(item => item.id === active[0].id);
        check(cancelled?.status === "cancelled" && cancelled.completedAt, "The original current occurrence was not cancelled in place.");
        assert.deepEqual(occurrences, priorOccurrences.map(item => item.id === cancelled.id ? { ...item, status: "cancelled", completedAt: cancelled.completedAt } : item));
      } else {
        assert.deepEqual(occurrences, priorOccurrences);
      }
    } else {
      check(occurrences.filter(item => item.status === "scheduled").length === 1, "Expected one durable scheduled occurrence for the active reminder.");
    }
  }
  const [stored] = await database.select({ status: schema.conversationMessages.status }).from(schema.conversationMessages).where(and(eq(schema.conversationMessages.userId, actor.id), eq(schema.conversationMessages.id, message.id)));
  const [finished] = await database.select({ status: schema.scheduledActions.status }).from(schema.scheduledActions).where(and(eq(schema.scheduledActions.userId, actor.id), eq(schema.scheduledActions.id, job.id)));
  check(stored?.status === "processed" && finished?.status === "completed", "Inbound job did not persist completion.");
  return { step: id, channel, role, scriptedFixture: true, oneInbound: true, oneInboundJob: true, processed: true, tools: reads, reply: replies[0], assertionsPassed: true };
}

function sameState(before: Awaited<ReturnType<typeof readWorkspace>>, after: Awaited<ReturnType<typeof readWorkspace>>) {
  const durable = ({ tasks, items, reminders, goals, memories, profile, homePreferences, setup }: typeof before) =>
    ({ tasks, items, reminders, goals, memories, profile, homePreferences, setup });
  return JSON.stringify(durable(before)) === JSON.stringify(durable(after));
}

async function main() {
  const [mode, stepArg, channelArg, roleArg, extra] = process.argv.slice(2);
  check(!extra, "Unexpected extra arguments.");
  const identity = await pool.query("select current_database() as name, inet_server_addr()::text as address, inet_server_port() as port");
  assert.deepEqual(identity.rows[0], { name: "tempo_ui_release", address: "127.0.0.1/32", port: 55437 });
  if (mode === "init") {
    check(!stepArg, "init does not accept arguments.");
    await setup();
    return;
  }
  const run = await loadRun();
  if (mode === "clean") {
    check(isHttp && !stepArg, "Only a completed HTTP fixture can be cleaned by this command.");
    await database.transaction(async tx => {
      for (const role of ["a", "b"] as const) {
        const actor = run[role];
        const deleted = await tx.delete(schema.users).where(and(eq(schema.users.id, actor.id),
          eq(schema.users.phoneE164, actor.phone), eq(schema.users.profileInstructions, marker(run, role)))).returning({ id: schema.users.id });
        check(deleted.length === 1, "Could not clean the exact HTTP fixture account.");
      }
      await tx.delete(schema.rateLimitBuckets).where(inArray(schema.rateLimitBuckets.key, [run.a.id, run.b.id].map(id => `workspace-write:${id}`)));
    });
    await unlink(linkPath);
    console.log(JSON.stringify({ removedRunOwnedAccounts: 2 }));
    return;
  }
  if (mode === "links") {
    check(!stepArg, "links does not accept arguments.");
    await issueLinks(run);
    console.log("Fresh links written to the ignored fixture path.");
    return;
  }
  if (mode === "prompt") {
    check(stepArg && Object.hasOwn(steps, stepArg) && !channelArg, "Use prompt <step>.");
    console.log(steps[stepArg as keyof typeof steps].message(run.date));
    return;
  }
  check(mode === "turn" && stepArg && Object.hasOwn(steps, stepArg) && (!channelArg || channelArg === "sms" || channelArg === "web") && (!roleArg || roleArg === "a" || roleArg === "b"), "Use turn <step> [sms|web] [a|b].");
  const role = roleArg === "b" ? "b" : "a";
  const channel = channelArg === "web" ? "web" : "sms";
  const outsider = run[role === "a" ? "b" : "a"];
  const before = await readWorkspace(outsider.id, database);
  const result = await drive(run, stepArg, channel, role);
  const after = await readWorkspace(outsider.id, database);
  check(sameState(before, after) && JSON.stringify(before.messages) === JSON.stringify(after.messages), "Other fixture's durable data changed.");
  console.log(JSON.stringify({ ...result, otherAccountUnchanged: true }));
}

void main().catch(error => {
  console.error(error instanceof FixtureCheck ? error.message : `Account QA fixture failed${location(error) ? ` at ${location(error)}` : ""}${errorCode(error) ? ` (SQLSTATE ${errorCode(error)})` : ""}. Raw diagnostics withheld.`);
  process.exitCode = 1;
}).finally(() => pool.end());

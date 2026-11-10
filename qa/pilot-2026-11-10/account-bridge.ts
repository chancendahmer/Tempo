/** Run-owned browser account fixtures and captured, provider-free assistant turns. */
import { base, databaseUrl, key } from "./fixture-environment";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, eq, gt, inArray, isNull, like, or } from "drizzle-orm";
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
import { DrizzleMemoryRepository, savedMemorySearchPredicate } from "../../src/server/db/repositories/memory-repository";
import { DrizzleMessagingRepository } from "../../src/server/db/repositories/messaging-repository";
import { DrizzleOutboundMessageRepository } from "../../src/server/db/repositories/outbound-message-repository";
import { DrizzleReminderRepository } from "../../src/server/db/repositories/reminder-repository";
import { DrizzleSchedulingRepository } from "../../src/server/db/repositories/scheduling-repository";
import { DrizzleTaskRepository } from "../../src/server/db/repositories/task-repository";
import { WebReplySender } from "../../src/server/db/repositories/web-reply-repository";
import { mutateWorkspace, readWorkspace } from "../../src/server/db/repositories/workspace-repository";
import { readWorkspaceLifeItems } from "../../src/server/db/repositories/workspace-life-items";
import * as schema from "../../src/server/db/schema";
import { ConversationOrchestrator } from "../../src/server/domain/conversation-orchestrator";
import type { LifeItem, SavedLifeItem } from "../../src/server/domain/life-items";
import { executeGoalCommand } from "../../src/server/domain/goal-service";
import { executeReminderCommand } from "../../src/server/domain/reminder-service";
import { MemoryService } from "../../src/server/domain/memory-service";
import { SafeSmsSender } from "../../src/server/domain/outbound-messaging";
import { ScheduledActionRepository } from "../../src/server/jobs/scheduled-action-repository";
import { issueActionToken } from "../../src/server/security/action-token";
import { WebSessionService } from "../../src/server/security/web-session";
import { steps as existingSteps, titles } from "./scenario-steps";
import { assertLiveToolScope, isRundownPhase, isLibraryPreference, libraryMemorySavePrompt, libraryRecallQueries, liveBrowserSteps, releaseRundownCalendarUnverified, verifyRundownStatusReads, type LiveBrowserPhase, type LiveBrowserStep, type LiveTool } from "./live-browser-steps";

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

type Workspace = Awaited<ReturnType<typeof readWorkspace>>;
type Execute = Parameters<(typeof existingSteps)[string]["run"]>[0];
type FixtureItem<K extends LifeItem["kind"]> = SavedLifeItem & { data: Extract<LifeItem, { kind: K }> };
const museumThought = { title: "Museum workshop questions", body: "Ask about clay tools and Saturday places." };
const museumTaskTitle = "Ask the museum about clay tools";

function fixtureItem<K extends "note" | "meal" | "grocery" | "pantry">(workspace: Workspace, kind: K, title: string) {
  check(!workspace.itemsTruncated, "The fresh browser fixture needs complete item coverage.");
  const items = workspace.items.filter(item => item.data.kind === kind && item.data.title === title);
  check(items.length === 1, `Expected one owned fixture item named ${title}.`);
  return items[0] as FixtureItem<K>;
}

async function readExactFixtureItem(execute: Execute, { id, version, data }: FixtureItem<"note" | "meal" | "grocery" | "pantry">) {
  const result = JSON.parse(await execute({ type: "life_list", kind: data.kind, id }));
  assert.equal(result.truncated, false);
  assert.deepEqual(result.items, [{ id, version, data }]);
}

function museumLink(workspace: Workspace) {
  const note = fixtureItem(workspace, "note", museumThought.title);
  const tasks = workspace.tasks.filter(task => task.title === museumTaskTitle);
  check(!workspace.tasksTruncated && tasks.length === 1, "Expected exactly one museum task in the owned account.");
  const [task] = tasks;
  check(note.data.body === museumThought.body && note.data.taskId === task.id && note.linkedTask?.id === task.id && task.estimatedMinutes === 7,
    "Expected the original museum thought and its seven-minute linked task.");
  return { note, task };
}

function citrusShopping(workspace: Workspace, servings: 2 | 3 | 4) {
  const meal = fixtureItem(workspace, "meal", titles.meal);
  const rice = fixtureItem(workspace, "grocery", "rice");
  const lemon = fixtureItem(workspace, "grocery", "lemon");
  const tea = fixtureItem(workspace, "grocery", titles.grocery);
  const pantry = fixtureItem(workspace, "pantry", "Rice");
  assert.equal(meal.data.servings, servings);
  assert.deepEqual(rice.data.mealSources, [{ mealId: meal.id, quantity: servings * 100 }]);
  assert.deepEqual(lemon.data.mealSources, [{ mealId: meal.id, quantity: servings / 2 }]);
  check(rice.data.quantity === servings * 100 - 100 && rice.data.unit === "g" && !rice.data.checked && lemon.data.quantity === servings / 2 && !lemon.data.checked,
    "Generated rice and lemon needs did not match the current meal portions.");
  check(!tea.data.mealSources && pantry.data.quantity === 100 && pantry.data.unit === "g", "Expected manual tea and 100 g of pantry rice.");
  return { meal, rice, lemon, tea, pantry };
}

function citrusShoppingChange(from: 2 | 4, to: 2 | 3, message: string): (typeof existingSteps)[string] {
  return {
    grants: ["life_patch"],
    message: () => message,
    async run(execute, before) {
      const { meal } = citrusShopping(before, from);
      await readExactFixtureItem(execute, meal);
      return execute({ type: "life_patch", id: meal.id, version: meal.version, patch: { kind: "meal", servings: to } });
    },
    verify(before, after) {
      const old = citrusShopping(before, from), next = citrusShopping(after, to);
      assert.deepEqual(next.meal, { ...old.meal, version: old.meal.version + 1, data: { ...old.meal.data, servings: to } });
      for (const key of ["rice", "lemon"] as const) {
        assert.equal(next[key].id, old[key].id);
        assert.equal(next[key].version, old[key].version + 1);
      }
      assert.deepEqual(next.tea, old.tea);
      assert.deepEqual(next.pantry, old.pantry);
    },
  };
}

function citrusShoppingRead(servings: 2 | 3, message: string): (typeof existingSteps)[string] {
  return {
    grants: [],
    message: () => message,
    async run(execute, before) {
      const { meal, rice, lemon, tea, pantry } = citrusShopping(before, servings);
      for (const item of [meal, rice, lemon, tea, pantry]) await readExactFixtureItem(execute, item);
      return `${meal.data.title}: ${meal.data.servings} portions planned. To buy: ${rice.data.quantity} ${rice.data.unit} rice and ${lemon.data.quantity} lemon. Pantry: ${pantry.data.quantity} ${pantry.data.unit} rice. ${tea.data.title} is still on your manual shopping list.`;
    },
  };
}

const browserSteps = {
  "museum-thought-fresh": {
    grants: ["create_task"],
    message: () => `From my thought "${museumThought.title}", make "${museumTaskTitle}" a seven-minute task and keep the thought.`,
    async run(execute, before) {
      const note = fixtureItem(before, "note", museumThought.title);
      check(!before.tasksTruncated && !before.tasks.some(task => task.title === museumTaskTitle) && note.data.body === museumThought.body && !note.data.taskId,
        "Save the exact museum thought once in Rowan's browser before the fresh SMS turn.");
      await readExactFixtureItem(execute, note);
      return execute({ type: "create_task", title: museumTaskTitle, estimatedMinutes: 7, sourceNoteId: note.id });
    },
    verify(before, after) {
      const prior = fixtureItem(before, "note", museumThought.title);
      const { note, task } = museumLink(after);
      assert.equal(note.id, prior.id);
      assert.equal(note.version, prior.version + 1);
      assert.deepEqual(note.data, { ...prior.data, taskId: task.id });
    },
  },
  "museum-thought-read": {
    grants: [],
    message: () => "What does my saved Museum workshop questions thought say, and what is its linked task and estimate now?",
    async run(execute, before) {
      const { note, task } = museumLink(before);
      await readExactFixtureItem(execute, note);
      const list = await execute({ type: "list_tasks", status: "all" });
      const matches = list.split("\n").filter(line => line.includes(`. ${task.title} — ${task.status.replaceAll("_", " ")} · ${task.estimatedMinutes} min`));
      check(matches.length === 1, "The task tool did not confirm the linked museum task and current estimate.");
      return `${note.data.title} is still saved: ${note.data.body} Linked task: ${matches[0]}`;
    },
  },
  "citrus-shopping-fresh": citrusShoppingChange(4, 2, `Change my current ${titles.meal} plan from four portions back to two and update the shopping quantities.`),
  "citrus-shopping-read": citrusShoppingRead(2, "For my current Citrus rice dinner, how many portions are planned, what rice and lemon do I still need to buy, and what rice and tea are already listed?"),
  "citrus-shopping-three": citrusShoppingChange(2, 3, `Change my current ${titles.meal} plan from two portions to three and update the shopping quantities.`),
  "citrus-shopping-three-read": citrusShoppingRead(3, "After my latest Citrus rice dinner text, what portions are planned, what rice and lemon should I buy, and what rice is in my pantry? Also check my manual tea."),
} satisfies typeof existingSteps;
const steps: typeof existingSteps = { ...existingSteps, ...browserSteps };

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

export type LiveBrowserObservation = { persistedReply?: string };
type LiveTurn = { phase: LiveBrowserPhase; step: LiveBrowserStep; parser: TaskIntentParser; now: Date; date: string; tools: LiveTool[]; observation: LiveBrowserObservation };

async function drive(run: Run, id: keyof typeof steps, channel: "sms" | "web", role: Role, live?: LiveTurn) {
  const actor = run[role];
  const step = steps[id];
  check(role === "a" || (!live && !step.grants.length), "Writes are available only for the primary fixture.");
  const body = live?.step.message ?? step.message(run.date);
  const providerId = `qa-${run.id}-${role}-${id}`;
  const transport = new TestSmsTransport(`CAPTURED-${providerId}-`);
  const workspace = () => readWorkspace(actor.id, database, { diaryDate: live?.date });
  const prior = await workspace();
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
    const after = await workspace();
    check(sameState(prior, after), "Replay changed durable workspace state.");
    check(JSON.stringify(prior.messages) === JSON.stringify(after.messages) && !transport.sent.length, "Replay created another reply.");
    if (cancelledJourney) {
      check(original?.status === "cancelled" && priorOccurrences.some(item => item.status === "cancelled" && item.runAt.getTime() === original.remindAt.getTime()), "Replay lost the cancelled reminder occurrence.");
      check(priorOccurrences.every(item => item.status === "cancelled" || item.status === "completed"), "Replay found deliverable reminder work.");
      assert.deepEqual(await reminderOccurrences(actor.id, original.id), priorOccurrences);
    }
    if (id === "museum-thought-fresh") museumLink(after);
    if (id === "citrus-shopping-fresh") citrusShopping(after, 2);
    if (id === "citrus-shopping-three") citrusShopping(after, 3);
    return { step: id, channel, role, duplicate: true, oneInbound: true, oneInboundJob: true, unchanged: true, noExtraReply: true };
  }
  check(message.status === "received" && job.status === "scheduled", "Expected a fresh inbound message and scheduled job.");
  const reads: string[] = [];
  let parserFailure: unknown;
  const liveAuthorizer = live?.parser.authorizer;
  check(!live || liveAuthorizer, "Live turns require the real independent authorizer.");
  const parser: TaskIntentParser = {
    authorizer: liveAuthorizer ? { authorize: async input => {
      try {
        const context = JSON.stringify(input);
        check(!context.includes(marker(run, "b")) && !context.includes(privateNote(run)), "Other account data reached the live authorizer.");
        return await liveAuthorizer.authorize(input);
      } catch (error) {
        parserFailure = error;
        throw error;
      }
    } } : { authorize: async () => step.grants.length ? { mode: "write", commands: step.grants } : { mode: "read_only", commands: [] } },
    parse: async input => {
      check(input.message === body && input.execute, "The parser received an unexpected message.");
      check(!JSON.stringify(input).includes(marker(run, role === "a" ? "b" : "a")), "Other account profile reached the parser.");
      if (role === "a") check(!JSON.stringify(input).includes(privateNote(run)), "Cedar's private note reached Rowan's parser context.");
      const execute = input.execute;
      try {
        if (live) {
          if (live.phase === "memory-recall") {
            check(input.history?.some(message => message.role === "user" && message.content === libraryMemorySavePrompt),
              "The earlier memory request did not reach current chat history.");
            check(!input.memories.some(isLibraryPreference), "The deleted preference reached current saved memory context.");
          }
          const parsed = await live.parser.parse({ ...input, execute: async command => {
            try {
              assertLiveToolScope(live.phase, prior, live.date, live.tools, command);
              if (live.phase === "rundown-release" && command.type === "calendar_agenda") {
                live.tools.push({ command, result: releaseRundownCalendarUnverified });
                return releaseRundownCalendarUnverified;
              }
              const result = await execute(command);
              check(!result.includes(privateNote(run)) && !result.includes(marker(run, "b")), "Other account data reached a live tool response.");
              reads.push(command.type);
              live.tools.push({ command, result });
              return result;
            } catch (error) {
              parserFailure = error;
              live.tools.push({ command, result: "QA fixture rejected this tool call or its result." });
              throw error;
            }
          } });
          check(parsed.kind === "conversation", "The live parser must use the observed tool executor.");
          return parsed;
        }
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
      }), live ? () => live.now : undefined, undefined, new MemoryService(new DrizzleMemoryRepository(database)), undefined,
      new DrizzleConversationHistoryRepository(database), new DrizzleReminderRepository(database), undefined,
      new LifeAssistant(database), new DrizzleItemReviewRepository(database),
    );
    await orchestrator.process(message.id);
    await actions.markCompleted(job.id);
  } catch (error) {
    await actions.markFailed(job.id, new Error("Synthetic fixture turn failed"));
    throw error;
  }
  const after = await workspace().catch(error => { throw parserFailure ?? error; });
  const replies = channel === "sms" ? transport.sent.map(item => item.body) : after.messages.filter(item => item.direction === "outbound" && !prior.messages.some(before => before.id === item.id)).map(item => item.body);
  if (live && replies.length === 1 && (role !== "a" || (!replies[0].includes(privateNote(run)) && !replies[0].includes(marker(run, "b"))))) {
    live.observation.persistedReply = replies[0];
  }
  if (parserFailure) throw parserFailure;
  check(replies.length === 1, "Expected one captured reply from the selected account.");
  if (role === "a") check(!replies[0].includes(privateNote(run)), "Cedar's note leaked in Rowan's reply.");
  check(reads.length > 0, "No repository-backed tool executed.");
  if (live ? live.step.readOnly : !step.grants.length) check(sameState(prior, after), "Read-only turn changed durable workspace state.");
  if (live) {
    const change = live.step.verify(prior, after, live.date, live.tools);
    const remaining = (state: typeof prior) => ({
      ...state,
      items: change?.kind === "item" ? state.items.filter(item => item.id !== change.id) : state.items,
      memories: change?.kind === "memory" ? state.memories.filter(memory => memory.id !== change.id) : state.memories,
    });
    check(sameState(remaining(prior), remaining(after)), "Live turn changed records outside the expected fixture entry.");
  } else {
    step.verify?.(prior, after, run.date);
  }
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
  return { step: id, channel, role, scriptedFixture: !live, oneInbound: true, oneInboundJob: true, processed: true, tools: reads, reply: replies[0], assertionsPassed: true };
}

function sameState(before: Awaited<ReturnType<typeof readWorkspace>>, after: Awaited<ReturnType<typeof readWorkspace>>) {
  const durable = ({ tasks, items, reminders, goals, memories, profile, homePreferences, setup }: typeof before) =>
    ({ tasks, items, reminders, goals, memories, profile, homePreferences, setup });
  return JSON.stringify(durable(before)) === JSON.stringify(durable(after));
}

async function requireFixtureDatabase() {
  const identity = await pool.query("select current_database() as name, inet_server_addr()::text as address, inet_server_port() as port");
  assert.deepEqual(identity.rows[0], { name: "tempo_ui_release", address: "127.0.0.1/32", port: 55437 });
}

async function liveFixtureItems(userId: string, date: string, rundown = false) {
  const workspace = await readWorkspaceLifeItems(database, userId, date);
  check(!workspace.itemsTruncated, "Live fixture item coverage is incomplete.");
  const memory = schema.memoryEntries;
  const memories = await database.select({ id: memory.id, category: memory.category, content: memory.content }).from(memory)
    .where(and(eq(memory.userId, userId), isNull(memory.deletedAt), or(isNull(memory.expiresAt), gt(memory.expiresAt, new Date()))));
  if (!rundown) return { ...workspace, memories };
  const { tasks, goals, reminders, users } = schema;
  const [taskRows, goalRows, reminderRows, [profile]] = await Promise.all([
    database.select({ title: tasks.title, status: tasks.status, estimatedMinutes: tasks.estimatedMinutes, dueAt: tasks.dueAt })
      .from(tasks).where(eq(tasks.userId, userId)).limit(201),
    database.select({ title: goals.title, status: goals.status }).from(goals).where(eq(goals.userId, userId)).limit(101),
    database.select({ id: reminders.id, text: reminders.text, status: reminders.status, remindAt: reminders.remindAt })
      .from(reminders).where(eq(reminders.userId, userId)).limit(201),
    database.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  check(profile && taskRows.length <= 200 && goalRows.length <= 100 && reminderRows.length <= 200, "Rundown fixture coverage is incomplete.");
  return { ...workspace, memories, tasks: taskRows, goals: goalRows, reminders: reminderRows, timezone: profile.timezone };
}

async function libraryMemoryHistory(userId: string, query?: string) {
  const memory = schema.memoryEntries;
  const source = schema.conversationMessages;
  return database.select({ id: memory.id, category: memory.category, content: memory.content, deletedAt: memory.deletedAt })
    .from(memory).innerJoin(source, and(eq(source.id, memory.sourceMessageId), eq(source.userId, userId)))
    .where(and(eq(memory.userId, userId), eq(source.body, libraryMemorySavePrompt), eq(source.direction, "inbound"),
      eq(source.status, "processed"), like(source.idempotencyKey, `web-chat:${userId}:%`),
      eq(memory.sensitivity, "normal"), or(isNull(memory.expiresAt), gt(memory.expiresAt, new Date())), savedMemorySearchPredicate(query)));
}

async function verifyLibraryMemoryHistory(userId: string, deleted: boolean) {
  const rows = await libraryMemoryHistory(userId);
  check(rows.length === 1 && rows[0].category === "preference" && isLibraryPreference(rows[0].content)
    && Boolean(rows[0].deletedAt) === deleted, "Expected the exact saved-memory record and its retained source chat.");
  return rows[0];
}

async function otherAccountSnapshot(userId: string) {
  const { rows: [snapshot] } = await pool.query(`
    select
      (select to_jsonb(r) from users r where r.id = $1) as user,
      (select jsonb_agg(to_jsonb(r) order by r.id) from life_items r where r.user_id = $1) as items,
      (select jsonb_agg(to_jsonb(r) order by r.id) from tasks r where r.user_id = $1) as tasks,
      (select jsonb_agg(to_jsonb(r) order by r.id) from goals r where r.user_id = $1) as goals,
      (select jsonb_agg(to_jsonb(r) order by r.id) from reminders r where r.user_id = $1) as reminders,
      (select jsonb_agg(to_jsonb(r) order by r.id) from memory_entries r where r.user_id = $1) as memories,
      (select jsonb_agg(to_jsonb(r) order by r.id) from conversation_messages r where r.user_id = $1) as messages,
      (select jsonb_agg(to_jsonb(r) order by r.id) from scheduled_actions r where r.user_id = $1) as actions
  `, [userId]);
  check(snapshot?.user, "The second fixture account is absent.");
  return snapshot;
}

async function livePhasePreflight(run: Run, phase: LiveBrowserPhase, date: string) {
  const fixture = await liveFixtureItems(run.a.id, date, isRundownPhase(phase));
  liveBrowserSteps[phase].preflight(fixture, date);
  if (isRundownPhase(phase)) {
    const context = { userId: run.a.id, sourceMessageId: randomUUID(), now: new Date(), timezone: "America/New_York", forModel: true };
    const goals = { type: "list_goals", status: "all" } as const;
    const reminders = { type: "list_reminders", includePast: true } as const;
    const [goalList, reminderList] = await Promise.all([
      executeGoalCommand(new DrizzleGoalRepository(database), goals, context),
      executeReminderCommand(new DrizzleReminderRepository(database), reminders, context),
    ]);
    verifyRundownStatusReads(fixture, date, { command: goals, result: goalList.reply }, { command: reminders, result: reminderList });
  }
  if (phase === "memory-save") check(!(await libraryMemoryHistory(run.a.id)).length, "The memory phase already has a source record.");
  if (phase === "memory-recall") {
    const deleted = await verifyLibraryMemoryHistory(run.a.id, true);
    const query = "library study preference";
    check((await libraryMemoryHistory(run.a.id, query)).some(row => row.id === deleted.id),
      "The original recall query still fails to match the owned record's content and category.");
    const active = await new DrizzleMemoryRepository(database).searchRelevant(run.a.id, new Date(), query, 21);
    check(!active.some(row => row.id === deleted.id), "Current saved-memory search returned the deleted record.");
    return deleted;
  }
}

export async function preflightLiveBrowserTurn(phase: LiveBrowserPhase, date: string) {
  try {
    check(fixtureMode === "browser", "The browser fixture is required.");
    await requireFixtureDatabase();
    const run = await loadRun();
    await otherAccountSnapshot(run.b.id);
    const deleted = await livePhasePreflight(run, phase, date);
    return deleted ? { originalQueryMatchesDeletedRecord: true, deletedRecordExcludedFromCurrentSearch: true }
      : isRundownPhase(phase) ? { ownedGoalStatusVerified: true, cancelledReminderHistoryVerified: true } : {};
  } finally { await pool.end(); }
}

export async function runLiveBrowserTurn(
  phase: LiveBrowserPhase,
  channel: "sms" | "web",
  parser: TaskIntentParser,
  now: Date,
  date: string,
  tools: LiveTool[],
  paidAttempts: () => number,
  observation: LiveBrowserObservation,
) {
  try {
    check(fixtureMode === "browser" && parser.authorizer, "A real authorizer and the browser fixture are required.");
    await requireFixtureDatabase();
    const run = await loadRun();
    const before = await otherAccountSnapshot(run.b.id);
    const step = liveBrowserSteps[phase];
    const tombstone = await livePhasePreflight(run, phase, date);
    const id = isRundownPhase(phase) || phase.startsWith("memory-") ? `live-${phase}` : `live-nutrition-${phase}`;
    const live = { phase, step, parser, now, date, tools, observation };
    const result = await drive(run, id, channel, "a", live);
    check(!result.duplicate, "This phase has already run; only fresh turns count as live evidence.");
    const attempts = paidAttempts();
    const replay = await drive(run, id, channel, "a", live);
    check(replay.duplicate && paidAttempts() === attempts, "Replay did not deduplicate without another paid attempt.");
    if (phase === "memory-save") await verifyLibraryMemoryHistory(run.a.id, false);
    if (phase === "memory-recall") {
      assert.deepEqual(await verifyLibraryMemoryHistory(run.a.id, true), tombstone);
      const candidates = await Promise.all(libraryRecallQueries(tools).map(({ query }) => libraryMemoryHistory(run.a.id, query)));
      check(tombstone && candidates.some(rows => rows.some(row => row.id === tombstone.id)),
        "No current recall tool query would have found the exact record before it was deleted.");
    }
    assert.deepEqual(await otherAccountSnapshot(run.b.id), before, "Other fixture's durable data changed.");
    return { ...result, replay: channel === "sms" ? "same_provider_event" : "same_completed_web_job",
      ...(phase === "memory-recall" ? { deletedMemoryAbsentWithSourceChatRetained: true } : {}),
      replayUnchanged: true, replayPaidAttempts: 0, otherAccountUnchanged: true };
  } finally { await pool.end(); }
}

async function main() {
  const [mode, stepArg, channelArg, roleArg, extra] = process.argv.slice(2);
  check(!extra, "Unexpected extra arguments.");
  await requireFixtureDatabase();
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
      const rateLimitKeys = [run.a.id, run.b.id].flatMap(id => [`workspace-write:${id}`, `setup-write:${id}`]);
      await tx.delete(schema.rateLimitBuckets).where(inArray(schema.rateLimitBuckets.key, rateLimitKeys));
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
  if (mode === "goal-proof") {
    check(isHttp && actorSchema.shape.id.safeParse(stepArg).success && actorSchema.shape.id.safeParse(channelArg).success && !roleArg,
      "Goal proof requires an HTTP run and its task/goal IDs.");
    const client = await pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const [counts] = (await client.query(`
        select (select count(*)::int from task_events e
          join tasks t on t.id=e.task_id and t.user_id=e.user_id
          where e.user_id=$1 and t.id=$3 and t.goal_id=$4 and e.event_type='completed') as "taskCompletionEvents",
          (select count(*)::int from goal_events e join goals g on g.id=e.goal_id and g.user_id=e.user_id
          where e.user_id=$1 and g.id=$4 and e.event_type='completed') as "goalAchievementEvents",
          ((select count(*) from task_events where user_id=$2) +
           (select count(*) from goal_events where user_id=$2))::int as "otherAccountGoalTaskEvents"
      `, [run.a.id, run.b.id, stepArg, channelArg])).rows;
      await client.query("commit");
      console.log(JSON.stringify(counts));
    } finally { client.release(true); }
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
  if (Object.hasOwn(browserSteps, stepArg)) {
    check(!isHttp && role === "a" && channel === (stepArg.endsWith("-read") ? "web" : "sms"),
      "The fresh steps require Rowan's browser fixture, with SMS for writes and Ask Tempo for reads.");
  }
  const outsider = run[role === "a" ? "b" : "a"];
  const before = await readWorkspace(outsider.id, database);
  const result = await drive(run, stepArg, channel, role);
  const after = await readWorkspace(outsider.id, database);
  check(sameState(before, after) && JSON.stringify(before.messages) === JSON.stringify(after.messages), "Other fixture's durable data changed.");
  console.log(JSON.stringify({ ...result, otherAccountUnchanged: true }));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("qa/pilot-2026-11-10/account-bridge.ts")) void main().catch(error => {
  console.error(error instanceof FixtureCheck ? error.message : `Account QA fixture failed${location(error) ? ` at ${location(error)}` : ""}${errorCode(error) ? ` (SQLSTATE ${errorCode(error)})` : ""}. Raw diagnostics withheld.`);
  process.exitCode = 1;
}).finally(() => pool.end());

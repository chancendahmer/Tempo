import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { fromDrizzle, PgBoss } from "pg-boss";
import { z } from "zod";
import * as schema from "../../src/server/db/schema";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { DrizzleConversationRepository } from "../../src/server/db/repositories/conversation-repository";
import { DrizzleConversationHistoryRepository } from "../../src/server/db/repositories/conversation-history-repository";
import { DrizzleTaskRepository } from "../../src/server/db/repositories/task-repository";
import { DrizzleGoalRepository } from "../../src/server/db/repositories/goal-repository";
import { DrizzleSchedulingRepository } from "../../src/server/db/repositories/scheduling-repository";
import { DrizzleMemoryRepository } from "../../src/server/db/repositories/memory-repository";
import { DrizzleReminderRepository } from "../../src/server/db/repositories/reminder-repository";
import { DrizzleItemReviewRepository } from "../../src/server/db/repositories/item-review-repository";
import { WebReplySender } from "../../src/server/db/repositories/web-reply-repository";
import { LifeAssistant } from "../../src/server/db/repositories/life-assistant";
import { readWorkspace } from "../../src/server/db/repositories/workspace-repository";
import { ConversationOrchestrator } from "../../src/server/domain/conversation-orchestrator";
import { MemoryService } from "../../src/server/domain/memory-service";
import type { TaskIntentParser } from "../../src/server/adapters/llm/task-intent-parser";
import { turnAuthorizationSchema, type TurnAuthorization, type TurnAuthorizer } from "../../src/server/domain/turn-write-policy";
import { ScheduledActionRepository } from "../../src/server/jobs/scheduled-action-repository";
import type { ProcessInboundJob } from "../../src/server/jobs/names";

export function assertLocalQaDatabase(connectionString: string) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/tempo_[a-z0-9_]+$/.test(url.pathname) || url.searchParams.has("host") || url.searchParams.has("hostaddr")) throw Error("Probe requires a local tempo_* QA database");
}

/** Observe only validated returned grants, never prompts, history or errors. */
export function observeProbeAuthorizer(authorizer: TurnAuthorizer | undefined, record: (decision: TurnAuthorization) => void): TurnAuthorizer | undefined {
  if (!authorizer) return undefined;
  return { authorize: async input => {
    const decision = await authorizer.authorize(input);
    const parsed = turnAuthorizationSchema.safeParse(decision);
    if (parsed.success) record({ mode: parsed.data.mode, commands: [...parsed.data.commands] });
    return decision;
  } };
}

const reminderSnapshotSchema = z.object({
  id: z.uuid(), text: z.string(), remindAt: z.iso.datetime(), timezone: z.string(), status: z.enum(["scheduled", "cancelled"]),
  sourceMessageId: z.uuid().nullable(), recurrence: z.string().nullable(), provider: z.string().nullable(), providerMessageSid: z.string().nullable(), sentAt: z.iso.datetime().nullable(),
});
export type ReminderProbeSnapshot = z.infer<typeof reminderSnapshotSchema>;
const previousReminderProofSchema = z.object({ passed: z.literal(true), userId: z.uuid(), reminderProof: z.object({ text: z.string(), reminders: z.array(reminderSnapshotSchema).min(1).max(8) }) });
export const reminderProbeExpectationSchema = z.object({
  text: z.string().trim().min(3).max(240), count: z.number().int().min(0).max(8),
  hours: z.array(z.number().int().min(0).max(23)).max(8).optional(), date: z.iso.date().optional(),
  previous: previousReminderProofSchema.optional(),
}).superRefine((value, context) => {
  if (value.hours && value.hours.length !== value.count) context.addIssue({ code: "custom", message: "Expected hours must match the scheduled reminder count" });
  if (value.count === 0 && !value.previous) context.addIssue({ code: "custom", message: "Cancellation requires a previous reminder proof" });
});
export type ReminderProbeExpectation = z.infer<typeof reminderProbeExpectationSchema>;
export type ReminderProbeAction = { id: string; reminderId: string | null; status: string; runAt: string; payload: Record<string, unknown>; queueJobId: string | null; attempts: number };
const orderedReminderSnapshots = (rows: ReminderProbeSnapshot[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

export function assertReminderProbeBefore(userId: string, raw: ReminderProbeExpectation, rows: ReminderProbeSnapshot[]) {
  const expected = reminderProbeExpectationSchema.parse(raw);
  if (!expected.previous) { if (rows.length) throw Error("Use a new unique synthetic reminder marker"); return; }
  const previous = expected.previous;
  if (previous.userId !== userId || previous.reminderProof.text !== expected.text) throw Error("Previous proof must belong to this account and reminder marker");
  if (JSON.stringify(orderedReminderSnapshots(rows.map(row => reminderSnapshotSchema.parse(row)))) !== JSON.stringify(orderedReminderSnapshots(previous.reminderProof.reminders))) throw Error("Reminder state changed since the previous proof");
}

/** Pure assertions over selected database rows; no delivery or provider calls. */
export function verifyReminderProbe(input: { userId: string; messageId: string; timezone: string; expected: ReminderProbeExpectation; before: ReminderProbeSnapshot[]; after: ReminderProbeSnapshot[]; actions: ReminderProbeAction[] }) {
  const expected = reminderProbeExpectationSchema.parse(input.expected);
  assertReminderProbeBefore(input.userId, expected, input.before);
  const rows = input.after.map(row => reminderSnapshotSchema.parse(row));
  if (rows.some(row => !row.text.toLowerCase().includes(expected.text.toLowerCase()) || row.timezone !== input.timezone || row.provider || row.providerMessageSid || row.sentAt || row.recurrence)) throw Error("Expected undelivered one-time reminders in the account timezone");
  if (expected.previous) {
    if (JSON.stringify(rows.map(row => row.id).sort()) !== JSON.stringify(input.before.map(row => row.id).sort())) throw Error("Editing or cancelling reminders must preserve their IDs");
  } else if (rows.some(row => row.sourceMessageId !== input.messageId)) throw Error("Created reminders must belong to this web message");
  const scheduled = rows.filter(row => row.status === "scheduled");
  if (scheduled.length !== expected.count || (!expected.previous && rows.length !== expected.count)) throw Error("Unexpected scheduled reminder count");
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const localTimes = scheduled.map(row => {
    const parts = Object.fromEntries(format.formatToParts(new Date(row.remindAt)).map(part => [part.type, part.value]));
    return { id: row.id, date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
  });
  if (expected.date && localTimes.some(time => time.date !== expected.date)) throw Error("Unexpected local reminder date");
  if (expected.hours && (localTimes.some(time => time.minute || time.second) || scheduled.some(row => new Date(row.remindAt).getUTCMilliseconds()) || JSON.stringify(localTimes.map(time => time.hour).sort((a, b) => a - b)) !== JSON.stringify([...expected.hours].sort((a, b) => a - b)))) throw Error("Unexpected local reminder time");
  if (input.actions.some(action => !rows.some(row => row.id === action.reminderId) || action.queueJobId || action.attempts !== 0 || !["scheduled", "cancelled"].includes(action.status))) throw Error("Reminder delivery must remain undispatched");
  for (const row of rows) {
    const active = input.actions.filter(action => action.reminderId === row.id && action.status === "scheduled");
    if (row.status === "cancelled" ? active.length !== 0 : active.length !== 1) throw Error("Unexpected active reminder delivery actions");
    if (active.some(action => action.runAt !== row.remindAt || action.payload.reminderId !== row.id || action.payload.occurrenceAt !== row.remindAt)) throw Error("Reminder and durable delivery times do not agree");
    if (!input.actions.some(action => action.reminderId === row.id)) throw Error("Missing durable reminder action history");
  }
  return { text: expected.text, count: scheduled.length, timezone: input.timezone, expectedHours: expected.hours, expectedDate: expected.date, identityPreserved: !!expected.previous, beforeReminders: orderedReminderSnapshots(input.before), reminders: orderedReminderSnapshots(rows), localTimes, actions: input.actions };
}

/** Processes exactly one existing web-chat action through a real pg-boss
 * consumer and the production orchestrator/repositories. No SMS transport,
 * calendar integration, general dispatcher, scheduler or migrations run. */
export async function runLocalWebMessageProbe(input: { connectionString: string; userId: string; messageId: string; expectedNoteTitle?: string; expectedReminder?: ReminderProbeExpectation; onAuthorization?: (decision: TurnAuthorization) => void }, parser: TaskIntentParser) {
  assertLocalQaDatabase(input.connectionString);
  z.uuid().parse(input.userId); z.uuid().parse(input.messageId);
  if (!!input.expectedNoteTitle === !!input.expectedReminder) throw Error("Choose exactly one note or reminder expectation");
  const noteTitle = input.expectedNoteTitle ? z.string().trim().min(3).max(240).parse(input.expectedNoteTitle) : undefined;
  const reminderExpected = input.expectedReminder ? reminderProbeExpectationSchema.parse(input.expectedReminder) : undefined;
  const expectedMarker = noteTitle ?? reminderExpected!.text;
  const pool = new Pool({ connectionString: input.connectionString, max: 6, connectionTimeoutMillis: 5000, application_name: "tempo-local-web-qa" });
  const database = scopedDatabase(drizzle(pool, { schema }));
  const boss = new PgBoss({ connectionString: input.connectionString, schema: "pgboss_web_qa" });
  const queue = `qa-web-${input.messageId}`;
  let started = false;
  let consumerRegistered = false;
  let actionId: string | undefined;
  const tools: string[] = [];
  const authorization: TurnAuthorization[] = [];
  let parserCalls = 0;
  let rejectWorker: (error: Error) => void = () => undefined;
  boss.on("error", () => rejectWorker(Error("QA queue failure")));
  try {
    const [message] = await database.select().from(schema.conversationMessages).where(and(eq(schema.conversationMessages.id, input.messageId), eq(schema.conversationMessages.userId, input.userId)));
    if (!message || message.direction !== "inbound" || message.status !== "received" || message.kind !== "user" || !message.idempotencyKey?.startsWith(`web-chat:${input.userId}:`) || !message.body.toLowerCase().includes(expectedMarker.toLowerCase())) throw Error("Expected an unprocessed account-owned synthetic web message containing the expected marker");
    const pending = await database.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.userId, input.userId), eq(schema.scheduledActions.kind, "process_inbound_message"), inArray(schema.scheduledActions.status, ["scheduled", "running", "failed"])));
    if (pending.length !== 1 || pending[0].status !== "scheduled" || pending[0].queueJobId || pending[0].payload.messageId !== input.messageId) throw Error("Account must have exactly this one undispatched inbound action");
    actionId = pending[0].id;
    const before = await readWorkspace(input.userId, database);
    if (noteTitle && before.items.some(row => row.data.kind === "note" && row.data.title === noteTitle)) throw Error("Use a new unique synthetic note title");
    const readReminders = async (): Promise<ReminderProbeSnapshot[]> => {
      if (!reminderExpected) return [];
      const marker = reminderExpected.text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
      const rows = await database.select().from(schema.reminders).where(and(eq(schema.reminders.userId, input.userId), ilike(schema.reminders.text, `%${marker}%`)));
      return rows.map(row => reminderSnapshotSchema.parse({ id: row.id, text: row.text, remindAt: row.remindAt.toISOString(), timezone: row.timezone, status: row.status, sourceMessageId: row.sourceMessageId, recurrence: row.recurrence, provider: row.provider, providerMessageSid: row.providerMessageSid, sentAt: row.sentAt?.toISOString() ?? null }));
    };
    const remindersBefore = await readReminders();
    if (reminderExpected) assertReminderProbeBefore(input.userId, reminderExpected, remindersBefore);
    await boss.start(); started = true;
    await boss.createQueue(queue, { policy: "key_strict_fifo", retryLimit: 0, expireInSeconds: 180, retentionSeconds: 3600 });
    let resolveWorker!: () => void;
    const completed = new Promise<void>((resolve, reject) => { resolveWorker = resolve; rejectWorker = reject; });
    const observed: TaskIntentParser = {
      authorizer: observeProbeAuthorizer(parser.authorizer, decision => { authorization.push(decision); input.onAuthorization?.({ mode: decision.mode, commands: [...decision.commands] }); }),
      parse: async args => { parserCalls++; return parser.parse({ ...args, execute: async command => { tools.push(command.type); return args.execute!(command); } }); },
    };
    await boss.work<ProcessInboundJob>(queue, { localConcurrency: 1, pollingIntervalSeconds: 0.5 }, async jobs => {
      for (const job of jobs) {
        if (job.data.messageId !== input.messageId || job.data.userId !== input.userId || job.data.scheduledActionId !== actionId) { rejectWorker(Error("Unexpected QA job")); throw Error("Unexpected QA job"); }
        const actions = new ScheduledActionRepository(database);
        try {
          if (!(await actions.markRunning(job.data.scheduledActionId))) throw Error("Action is no longer available");
          const coach = new ConversationOrchestrator(
            new DrizzleConversationRepository(database), new DrizzleTaskRepository(database), new DrizzleGoalRepository(database), new DrizzleSchedulingRepository(database), observed,
            new WebReplySender(input.messageId, database), undefined, undefined, new MemoryService(new DrizzleMemoryRepository(database)), undefined,
            new DrizzleConversationHistoryRepository(database), new DrizzleReminderRepository(database), undefined, new LifeAssistant(database), new DrizzleItemReviewRepository(database),
          );
          await coach.process(input.messageId, job.signal);
          await actions.markCompleted(job.data.scheduledActionId);
          resolveWorker();
        } catch {
          await actions.markFailed(job.data.scheduledActionId, "Synthetic local web probe failed; inspect its sanitized report.");
          rejectWorker(Error("Synthetic web worker failed"));
          throw Error("Synthetic web worker failed");
        }
      }
    });
    consumerRegistered = true;
    await database.transaction(async transaction => {
      const [claimed] = await transaction.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.id, actionId!), eq(schema.scheduledActions.status, "scheduled"))).for("update");
      if (!claimed || claimed.queueJobId) throw Error("Action already dispatched");
      const jobId = await boss.send(queue, { scheduledActionId: actionId, userId: input.userId, messageId: input.messageId }, { id: actionId, singletonKey: input.userId, db: fromDrizzle(transaction, sql) });
      if (!jobId) throw Error("QA job already exists");
      await transaction.update(schema.scheduledActions).set({ status: "running", queueJobId: jobId, attempts: sql`${schema.scheduledActions.attempts} + 1`, updatedAt: new Date() }).where(eq(schema.scheduledActions.id, actionId!));
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([completed, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error("QA worker timed out")), 150000); })]); }
    finally { if (timeout) clearTimeout(timeout); }
    await boss.offWork(queue, { wait: true });
    const [after, sources, replies, actions] = await Promise.all([
      readWorkspace(input.userId, database),
      database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, input.messageId)),
      database.select().from(schema.conversationMessages).where(and(eq(schema.conversationMessages.userId, input.userId), eq(schema.conversationMessages.idempotencyKey, `reply:${input.messageId}`))),
      database.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.id, actionId)),
    ]);
    const notes = after.items.filter(row => row.data.kind === "note" && row.data.title === noteTitle);
    if (!parserCalls || sources[0]?.status !== "processed" || actions[0]?.status !== "completed" || replies.length !== 1 || replies[0].status !== "delivered" || replies[0].provider !== null || (noteTitle && notes.length !== 1) || !after.messages.some(row => row.id === replies[0].id)) throw Error("Expected one processed message, expected result and delivered web reply");
    let reminderProof;
    if (reminderExpected) {
      const remindersAfter = await readReminders();
      const ids = remindersAfter.map(row => row.id);
      const delivery = ids.length ? await database.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.userId, input.userId), eq(schema.scheduledActions.kind, "deliver_reminder"), inArray(schema.scheduledActions.reminderId, ids))) : [];
      reminderProof = verifyReminderProbe({ userId: input.userId, messageId: input.messageId, timezone: before.timezone, expected: reminderExpected, before: remindersBefore, after: remindersAfter, actions: delivery.map(row => ({ id: row.id, reminderId: row.reminderId, status: row.status, runAt: row.runAt.toISOString(), payload: row.payload, queueJobId: row.queueJobId, attempts: row.attempts })) });
    }
    return { passed: true, mode: "real-postgres-pg-boss-live-model-web-only", messageId: input.messageId, userId: input.userId, actionId, queueSchema: "pgboss_web_qa", queue, parserCalls, tools, authorization, ...(noteTitle ? { note: notes[0] } : {}), ...(reminderProof ? { reminderProof } : {}), reply: { id: replies[0].id, body: replies[0].body }, sourceStatus: sources[0].status, actionStatus: actions[0].status };
  } finally {
    // Do not restore the metered provider fetch while a consumer can still run.
    if (consumerRegistered) await boss.offWork(queue, { wait: true });
    if (started) await boss.stop({ graceful: true, timeout: 5000 });
    await pool.end();
  }
}

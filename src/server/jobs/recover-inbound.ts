import { and, eq, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { z } from "zod";
import type { TempoDatabase } from "../db/client";
import { conversationMessages, scheduledActions } from "../db/schema";
import { JOB_NAMES, type ProcessInboundJob } from "./names";

export const recoveryRequestSchema = z.object({ userId: z.uuid(), jobId: z.uuid(),
  operator: z.string().trim().min(1).max(100), reason: z.string().trim().min(5).max(500), apply: z.boolean() });

/** Scoped operator action. Never reconciles uncertain provider submissions by guessing. */
export async function recoverFailedInbound(database: TempoDatabase, boss: Pick<PgBoss, "getJobById" | "retry">,
  raw: z.infer<typeof recoveryRequestSchema>, now = new Date()) {
  const input = recoveryRequestSchema.parse(raw);
  return database.transaction(async transaction => {
    const connection = { db: fromDrizzle(transaction, sql) };
    // pg-boss's parent table includes queue partitions. Lock the terminal job
    // before inspecting its related records, so two operators cannot race a retry.
    await transaction.execute(sql`select id from pgboss.job where name = ${JOB_NAMES.processInbound} and id = ${input.jobId}::uuid for update`);
    const job = await boss.getJobById<ProcessInboundJob>(JOB_NAMES.processInbound, input.jobId, connection);
    if (!job || job.state !== "failed" || job.singletonKey !== input.userId || job.data.userId !== input.userId) throw new Error("A failed inbound job owned by this account is required.");
    const [action] = await transaction.select().from(scheduledActions).where(and(eq(scheduledActions.id, job.data.scheduledActionId), eq(scheduledActions.userId, input.userId))).for("update");
    if (!action || action.kind !== "process_inbound_message" || action.queueJobId !== input.jobId || action.status !== "failed" || action.payload.messageId !== job.data.messageId) throw new Error("Job and action ownership/state do not match.");
    const [inbound] = await transaction.select().from(conversationMessages).where(and(eq(conversationMessages.id, job.data.messageId), eq(conversationMessages.userId, input.userId))).for("update");
    if (!inbound || inbound.direction !== "inbound" || !["received", "processing"].includes(inbound.status)) throw new Error("The inbound has already finished or is unavailable.");
    if (inbound.processingToken && inbound.processingStartedAt && inbound.processingStartedAt.getTime() > now.getTime() - 300_000) throw new Error("An inbound attempt still owns an active lease.");
    const replies = await transaction.select().from(conversationMessages).where(and(eq(conversationMessages.userId, input.userId), eq(conversationMessages.idempotencyKey, `reply:${inbound.id}`))).for("update");
    if (replies.some(reply => !["reserved", "accepted", "suppressed"].includes(reply.outboundState ?? ""))) throw new Error("Provider submission needs reconciliation; automatic resend is refused.");
    const result = { userId: input.userId, jobId: input.jobId, actionId: action.id, messageId: inbound.id,
      operation: "retry_failed_inbound", applied: input.apply };
    if (!input.apply) return result;
    const audit = { at: now.toISOString(), operator: input.operator, reason: input.reason, jobId: input.jobId, operation: result.operation };
    await boss.retry(JOB_NAMES.processInbound, input.jobId, connection);
    // Keep the action failed until the existing queued job claims it. Marking it
    // scheduled would let the dispatcher enqueue a second copy of the same job.
    await transaction.update(scheduledActions).set({ lastError: null, updatedAt: now,
      payload: { ...action.payload, recoveryAudit: [...(Array.isArray(action.payload.recoveryAudit) ? action.payload.recoveryAudit : []), audit] },
    }).where(eq(scheduledActions.id, action.id));
    return result;
  });
}

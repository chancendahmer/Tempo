import { proactiveBlockReasons } from "../../domain/context-engine";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, conversationStates, goals, itemReviews, lifeItems, reminders, tasks, users } from "../schema";
import { DAY_MS, ItemReviewResponder, ReviewTarget, itemReviewMessage, reviewIsDue } from "../../domain/item-review";
import { DrizzleContextEngineRepository } from "./context-engine-repository";
import { executeTaskCommand } from "../../domain/task-service";
import { executeGoalCommand } from "../../domain/goal-service";
import { DrizzleTaskRepository } from "./task-repository";
import { DrizzleGoalRepository } from "./goal-repository";
import { DrizzleReminderRepository } from "./reminder-repository";
import { mutateWorkspace } from "./workspace-repository";

const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Review = typeof itemReviews.$inferSelect;

export class DrizzleItemReviewRepository implements ItemReviewResponder {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  private async target(userId: string, kind: ReviewTarget["kind"], id: string, now: Date): Promise<ReviewTarget | null> {
    if (kind === "task") {
      const [row] = await this.database.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.id, id), inArray(tasks.status, ["not_started", "in_progress"]))).for("update");
      return row && reviewIsDue(row.updatedAt, row.dueAt, now) ? { kind, id, title: row.title, revision: revision([row.title, row.status, row.dueAt, row.updatedAt]), overdue: Boolean(row.dueAt && row.dueAt < now) } : null;
    }
    if (kind === "goal") {
      const [row] = await this.database.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.id, id), eq(goals.status, "active"))).for("update");
      // Progress on a goal's steps counts as activity on that goal.
      const [step] = await this.database.select({ updatedAt: tasks.updatedAt }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.goalId, id))).orderBy(desc(tasks.updatedAt)).limit(1);
      const updated = row && step && step.updatedAt > row.updatedAt ? step.updatedAt : row?.updatedAt;
      return row && updated && reviewIsDue(updated, null, now) ? { kind, id, title: row.title, revision: revision([row.title, row.description, row.status, updated]), overdue: false } : null;
    }
    if (kind === "reminder") {
      const [row] = await this.database.select().from(reminders).where(and(eq(reminders.userId, userId), eq(reminders.id, id), inArray(reminders.status, ["scheduled", "sent", "failed"]))).for("update");
      return row && !row.recurrence && reviewIsDue(row.updatedAt, row.remindAt, now) ? { kind, id, title: row.text, revision: revision([row.text, row.remindAt, row.status, row.updatedAt]), overdue: true } : null;
    }
    const [row] = await this.database.select().from(lifeItems).where(and(eq(lifeItems.userId, userId), eq(lifeItems.id, id))).for("update");
    const actionable = row && (row.data.kind === "note" || row.data.kind === "routine" || row.data.kind === "grocery" && !row.data.checked);
    return row && actionable && reviewIsDue(row.updatedAt, null, now) ? { kind, id, title: row.data.title, revision: revision([row.version, row.data]), overdue: false } : null;
  }

  private async eligible(userId: string, now: Date, excludeReviewId?: string) {
    const signals = await new DrizzleContextEngineRepository(this.database).loadSignals(userId, now, excludeReviewId);
    if (!signals || proactiveBlockReasons(signals, now).length) return false;
    const [pending] = await this.database.select({ id: conversationStates.userId }).from(conversationStates).where(and(eq(conversationStates.userId, userId), isNotNull(conversationStates.pendingAction), gt(conversationStates.pendingActionExpiresAt, now))).limit(1);
    return !pending;
  }

  async reserve(userId: string, now: Date): Promise<Review | null> {
    return this.database.transaction(async tx => {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      if (!user) return null;
      const db = tx as unknown as TempoDatabase, repo = new DrizzleItemReviewRepository(db);
      const [pending] = await tx.select().from(itemReviews).where(and(eq(itemReviews.userId, userId), eq(itemReviews.status, "reserved"))).limit(1);
      // Resume the same reservation after a worker restart; never create a new send key.
      if (pending) return pending;
      if (!await repo.eligible(userId, now)) return null;
      const [weekly] = await tx.select({ id: itemReviews.id }).from(itemReviews).where(and(eq(itemReviews.userId, userId), or(gt(itemReviews.createdAt, new Date(now.getTime() - 7 * DAY_MS)), gt(itemReviews.sentAt, new Date(now.getTime() - 7 * DAY_MS))))).limit(1);
      if (weekly) return null;
      const dayAgo = new Date(now.getTime() - DAY_MS), fortnight = new Date(now.getTime() - 14 * DAY_MS);
      const candidates = [
        ...(await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.status, ["not_started", "in_progress"]), lt(tasks.updatedAt, dayAgo), or(lt(tasks.dueAt, dayAgo), lt(tasks.updatedAt, fortnight)))).orderBy(asc(tasks.updatedAt)).limit(50)).map(row => ({ ...row, kind: "task" as const })),
        ...(await tx.select({ id: reminders.id }).from(reminders).where(and(eq(reminders.userId, userId), inArray(reminders.status, ["scheduled", "sent", "failed"]), lt(reminders.updatedAt, dayAgo), lt(reminders.remindAt, dayAgo))).orderBy(asc(reminders.updatedAt)).limit(50)).map(row => ({ ...row, kind: "reminder" as const })),
        ...(await tx.select({ id: goals.id }).from(goals).where(and(eq(goals.userId, userId), eq(goals.status, "active"), lt(goals.updatedAt, fortnight))).orderBy(asc(goals.updatedAt)).limit(50)).map(row => ({ ...row, kind: "goal" as const })),
        ...(await tx.select({ id: lifeItems.id }).from(lifeItems).where(and(eq(lifeItems.userId, userId), lt(lifeItems.updatedAt, fortnight), sql`${lifeItems.data}->>'kind' in ('note','routine','grocery')`)).orderBy(asc(lifeItems.updatedAt)).limit(50)).map(row => ({ ...row, kind: "life" as const })),
      ];
      const deferred = await tx.select({ target: itemReviews.target }).from(itemReviews).where(and(eq(itemReviews.userId, userId), gt(itemReviews.nextReviewAt, now)));
      for (const candidate of candidates) {
        if (deferred.some(row => row.target.kind === candidate.kind && row.target.id === candidate.id)) continue;
        const target = await repo.target(userId, candidate.kind, candidate.id, now);
        if (!target) continue;
        const [saved] = await tx.insert(itemReviews).values({ userId, target, createdAt: now, nextReviewAt: new Date(now.getTime() + 30 * DAY_MS) }).returning();
        return saved;
      }
      return null;
    });
  }

  /** Called again immediately before provider submission, under the worker fence. */
  async ready(id: string, now: Date) {
    const [review] = await this.database.select().from(itemReviews).where(eq(itemReviews.id, id)).limit(1);
    if (!review || review.status !== "reserved") return null;
    const target = await this.target(review.userId, review.target.kind, review.target.id, now);
    if (!target || target.revision !== review.target.revision) {
      await this.finish(id, null);
      return null;
    }
    if (!await this.eligible(review.userId, now, id)) return null;
    return { review, body: itemReviewMessage(review.target) };
  }

  async finish(id: string, messageId: string | null, now = new Date()) {
    await this.database.update(itemReviews).set({ status: messageId ? "sent" : "cancelled", messageId, sentAt: messageId ? now : null, nextReviewAt: new Date(now.getTime() + 30 * DAY_MS) }).where(and(eq(itemReviews.id, id), eq(itemReviews.status, "reserved")));
  }

  async respond(userId: string, messageId: string, body: string, now: Date): Promise<string | null> {
    if (!/^(keep|remove|later)[.!\s]*$/i.test(body.trim())) return null;
    return this.database.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const [prior] = await tx.select().from(itemReviews).where(and(eq(itemReviews.userId, userId), eq(itemReviews.responseMessageId, messageId))).limit(1);
      if (prior) return prior.reply;
      const [inbound] = await tx.select().from(conversationMessages).where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.userId, userId), eq(conversationMessages.direction, "inbound"))).limit(1);
      if (!inbound) return null;
      // An unrelated reply/reminder supersedes a bare REMOVE. Never guess its referent.
      const [previous] = await tx.select().from(conversationMessages).where(and(eq(conversationMessages.userId, userId), eq(conversationMessages.conversationId, inbound.conversationId!), sql`${conversationMessages.createdAt} < (select created_at from conversation_messages where id = ${messageId})`, or(inArray(conversationMessages.status, ["processed", "sent", "delivered"]), and(eq(conversationMessages.direction, "outbound"), eq(conversationMessages.status, "queued"), isNotNull(conversationMessages.providerMessageSid))))).orderBy(desc(conversationMessages.createdAt)).limit(1);
      if (!previous || previous.direction !== "outbound") return null;
      const [review] = await tx.select().from(itemReviews).where(and(eq(itemReviews.userId, userId), eq(itemReviews.messageId, previous.id), eq(itemReviews.status, "sent"), or(gt(itemReviews.createdAt, new Date(now.getTime() - 7 * DAY_MS)), gt(itemReviews.sentAt, new Date(now.getTime() - 7 * DAY_MS))))).limit(1).for("update");
      if (!review) return null;
      const choice = body.trim().replace(/[.!\s]+$/, "").toLowerCase();
      let reply = choice === "later" ? "Kept it. I can check again in two weeks." : "Kept it. I won’t ask about this item again for 90 days.";
      const db = tx as unknown as TempoDatabase;
      if (choice === "remove") {
        const current = await new DrizzleItemReviewRepository(db).target(userId, review.target.kind, review.target.id, now);
        reply = "That item changed since my check-in. I left it alone; tell me which item to remove now.";
        if (current?.revision === review.target.revision) {
          const context = { userId, sourceMessageId: messageId, now };
          if (current.kind === "task") reply = (await executeTaskCommand(new DrizzleTaskRepository(db), { type: "abandon_task", taskId: current.id }, context)).reply;
          else if (current.kind === "goal") reply = (await executeGoalCommand(new DrizzleGoalRepository(db), { type: "abandon_goal", goalId: current.id }, context)).reply;
          else if (current.kind === "reminder") {
            const result = await new DrizzleReminderRepository(db).cancel({ userId, reminderId: current.id, now });
            reply = result.kind === "cancelled" ? `Removed reminder: ${current.title}.` : "That reminder changed. I left it alone.";
          } else {
            const [item] = await tx.select().from(lifeItems).where(and(eq(lifeItems.userId, userId), eq(lifeItems.id, current.id)));
            reply = (await mutateWorkspace(userId, { action: "delete", id: item.id, version: item.version }, db, `review:${review.id}`)).message;
          }
        }
      }
      await tx.update(itemReviews).set({ status: "closed", responseMessageId: messageId, reply, resolvedAt: now, nextReviewAt: new Date(now.getTime() + (choice === "keep" ? 90 : 14) * DAY_MS) }).where(eq(itemReviews.id, review.id));
      return reply;
    });
  }
}

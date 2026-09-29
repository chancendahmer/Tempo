import { and, eq, isNull } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { z } from "zod";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { requireEnv } from "../../config/env";
import { getDatabase } from "../../db/client";
import { scheduledActions, webSessions } from "../../db/schema";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { issueActionToken } from "../../security/action-token";
import { JOB_NAMES, SendWelcomeJob } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

export async function registerSendSignInHandler(boss: PgBoss) {
  await boss.work<SendWelcomeJob>(JOB_NAMES.sendSignIn, { localConcurrency: 2 }, async jobs => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        const env = requireEnv(["APP_BASE_URL", "FIELD_ENCRYPTION_KEY"]);
        const database = getDatabase();
        const [action] = await database.select().from(scheduledActions).where(and(
          eq(scheduledActions.id, job.data.scheduledActionId), eq(scheduledActions.userId, job.data.userId),
          eq(scheduledActions.kind, "send_signin"),
        ));
        const { sessionId } = z.object({ sessionId: z.uuid() }).parse(action?.payload);
        const [session] = await database.select().from(webSessions).where(and(
          eq(webSessions.id, sessionId), eq(webSessions.userId, job.data.userId),
          isNull(webSessions.activatedAt), isNull(webSessions.revokedAt),
        ));
        if (!session || session.createdAt.getTime() + 15 * 60_000 <= Date.now() || session.expiresAt.getTime() <= Date.now()) {
          await actions.markCancelled(job.data.scheduledActionId, "signin_expired_or_used");
          continue;
        }
        const token = issueActionToken({ userId: job.data.userId, scope: "account:signin", sessionId }, env.FIELD_ENCRYPTION_KEY!, session.createdAt);
        const url = new URL("/api/auth/phone", env.APP_BASE_URL);
        url.searchParams.set("token", token);
        const result = await new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()).send({
          userId: job.data.userId, kind: "system", idempotencyKey: job.data.idempotencyKey,
          body: `Welcome back—you already have a Tempo account. Verify your sign-in and open your dashboard: ${url.toString()}\nExpires in 15 minutes. Only approve if you requested it. Reply STOP to opt out.`,
        });
        if (result.sent || result.reason === "duplicate") await actions.markCompleted(job.data.scheduledActionId);
        else await actions.markCancelled(job.data.scheduledActionId, result.reason);
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        throw error;
      }
    }
  });
}

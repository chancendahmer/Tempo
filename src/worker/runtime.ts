import { PgBoss } from "pg-boss";
import { getServerEnv, requireEnv, ServerEnvKey } from "../server/config/env";
import { closeDatabase } from "../server/db/client";
import { startActionDispatcher } from "../server/jobs/dispatcher";
import { registerSendWelcomeHandler } from "../server/jobs/handlers/send-welcome";
import { registerProcessInboundHandler } from "../server/jobs/handlers/process-inbound";
import { registerSyncCalendarHandler } from "../server/jobs/handlers/sync-calendar";
import { registerEvaluateContextHandler } from "../server/jobs/handlers/evaluate-context";
import { registerDeliverInterventionHandler } from "../server/jobs/handlers/deliver-intervention";
import { registerFeedbackFollowupHandler } from "../server/jobs/handlers/feedback-followup";
import { registerFeedbackTimeoutHandler } from "../server/jobs/handlers/feedback-timeout";
import { ScheduledActionRepository } from "../server/jobs/scheduled-action-repository";
import { JOB_NAMES } from "../server/jobs/names";
import { logger } from "../server/observability/logger";
import { OperationalRepository } from "../server/db/repositories/operational-repository";

export async function runWorker() {
  const messagingKeys: ServerEnvKey[] = getServerEnv().MESSAGING_PROVIDER === "linq"
    ? ["LINQ_API_KEY"]
    : [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_API_KEY_SID",
        "TWILIO_API_KEY_SECRET",
        "TWILIO_MESSAGING_SERVICE_SID",
      ];
  const env = requireEnv([
    "APP_BASE_URL",
    "DATABASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "FIELD_ENCRYPTION_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    ...messagingKeys,
  ]);
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL!,
    schema: "pgboss",
    application_name: env.WORKER_ID,
    useListenNotify: true,
  });
  boss.on("error", (error) => logger.error({ err: error }, "job queue error"));
  boss.on("warning", (warning) => logger.warn({ warning }, "job queue warning"));

  await boss.start();
  await boss.createQueue(JOB_NAMES.sendWelcome, {
    policy: "standard",
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 90,
    deleteAfterSeconds: 604_800,
    notify: true,
  });
  await boss.createQueue(JOB_NAMES.processInbound, {
    policy: "key_strict_fifo",
    retryLimit: 2,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 120,
    deleteAfterSeconds: 604_800,
    notify: true,
  });
  await boss.createQueue(JOB_NAMES.syncCalendar, {
    policy: "standard",
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 180,
    deleteAfterSeconds: 604_800,
    notify: true,
  });
  await boss.createQueue(JOB_NAMES.evaluateContext, {
    policy: "key_strict_fifo",
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120,
    deleteAfterSeconds: 604_800,
    notify: true,
  });
  await boss.createQueue(JOB_NAMES.deliverIntervention, {
    policy: "standard",
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120,
    deleteAfterSeconds: 604_800,
    notify: true,
  });
  await boss.createQueue(JOB_NAMES.feedbackFollowup, {
    policy: "standard",
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 120,
    deleteAfterSeconds: 604_800,
    notify: true,
  });
  await boss.createQueue(JOB_NAMES.feedbackTimeout, {
    policy: "standard",
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 120,
    deleteAfterSeconds: 604_800,
    notify: true,
  });
  await registerSendWelcomeHandler(boss);
  await registerProcessInboundHandler(boss);
  await registerSyncCalendarHandler(boss);
  await registerEvaluateContextHandler(boss);
  await registerDeliverInterventionHandler(boss);
  await registerFeedbackFollowupHandler(boss);
  await registerFeedbackTimeoutHandler(boss);
  const scheduledActionRepository = new ScheduledActionRepository();
  await Promise.all([
    scheduledActionRepository.seedMissingContextEvaluations(),
    scheduledActionRepository.seedMissingCalendarSyncs(),
  ]);
  const operations = new OperationalRepository();
  const heartbeat = () => operations.heartbeat("tempo-worker", { workerId: env.WORKER_ID, pid: process.pid });
  const cleanup = () => operations.cleanupExpiredData();
  await heartbeat();
  await cleanup();
  const heartbeatInterval = setInterval(() => void heartbeat().catch((error) => logger.error({ err: error }, "worker heartbeat failed")), 30_000);
  const cleanupInterval = setInterval(
    () => void cleanup().catch((error) => logger.error({ err: error }, "expired operational data cleanup failed")),
    6 * 3_600_000,
  );
  const stopDispatcher = startActionDispatcher(boss, env.WORKER_POLL_INTERVAL_MS);
  logger.info({ workerId: env.WORKER_ID }, "Tempo worker started");

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "Tempo worker stopping");
    stopDispatcher();
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
    await boss.stop({ graceful: true, timeout: 30_000 });
    await closeDatabase();
  };

  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));
}

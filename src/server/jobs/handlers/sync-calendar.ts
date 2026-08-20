import { PgBoss } from "pg-boss";
import { GoogleCalendarProvider } from "../../adapters/calendar/google-calendar-provider";
import { requireEnv } from "../../config/env";
import { DrizzleCalendarSyncRepository } from "../../db/repositories/calendar-sync-repository";
import { DrizzleExtensionSignalRepository } from "../../db/repositories/extension-signal-repository";
import { syncCalendar } from "../../domain/calendar-sync";
import { logger } from "../../observability/logger";
import { JOB_NAMES, SyncCalendarJob } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

export async function registerSyncCalendarHandler(boss: PgBoss) {
  await boss.work<SyncCalendarJob>(JOB_NAMES.syncCalendar, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        const env = requireEnv(["FIELD_ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
        const result = await syncCalendar({
          userId: job.data.userId,
          repository: new DrizzleCalendarSyncRepository(),
          signalRepository: new DrizzleExtensionSignalRepository(),
          provider: new GoogleCalendarProvider(),
          encryptionKey: env.FIELD_ENCRYPTION_KEY!,
        });
        if (result.synced) {
          await actions.completeAndScheduleCalendarSync(job.data.scheduledActionId, job.data.userId, new Date(Date.now() + 15 * 60_000));
        } else await actions.markCompleted(job.data.scheduledActionId);
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        await actions.scheduleRecurringRecovery({
          failedActionId: job.data.scheduledActionId,
          userId: job.data.userId,
          kind: "sync_calendar",
          runAt: new Date(Date.now() + 60 * 60_000),
        });
        logger.warn({ err: error, userId: job.data.userId }, "calendar sync failed without blocking SMS processing");
        throw error;
      }
    }
  });
}

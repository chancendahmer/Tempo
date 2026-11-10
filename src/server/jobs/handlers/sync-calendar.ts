import { inOwnedExecution, ownedService } from "../../domain/inbound-execution";
import { PgBoss } from "pg-boss";
import { GoogleCalendarProvider } from "../../adapters/calendar/google-calendar-provider";
import { requireEnv } from "../../config/env";
import { DrizzleCalendarSyncRepository } from "../../db/repositories/calendar-sync-repository";
import { DrizzleExtensionSignalRepository } from "../../db/repositories/extension-signal-repository";
import { syncCalendar } from "../../domain/calendar-sync";
import { JOB_NAMES, SyncCalendarJob } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";
import { failJob } from "../job-failure";

export async function registerSyncCalendarHandler(boss: PgBoss) {
  await boss.work<SyncCalendarJob>(JOB_NAMES.syncCalendar, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      let running = false;
      try {
        const ownership = await actions.claimRecurring(job.data.scheduledActionId, job.signal, job.expireInSeconds * 1000);
        if (!ownership) continue;
        running = true;
        const env = requireEnv(["FIELD_ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
        const result = await inOwnedExecution(ownership, () => syncCalendar({
          userId: job.data.userId,
          repository: ownedService(new DrizzleCalendarSyncRepository()),
          signalRepository: ownedService(new DrizzleExtensionSignalRepository()),
          provider: new GoogleCalendarProvider(),
          encryptionKey: env.FIELD_ENCRYPTION_KEY!,
        }));
        if (result.synced) {
          await actions.completeAndScheduleCalendarSync(job.data.scheduledActionId, job.data.userId, new Date(Date.now() + 15 * 60_000));
        } else await actions.markCompleted(job.data.scheduledActionId);
      } catch (error) {
        await failJob(error, { jobId: job.id, operation: "Calendar sync", level: "warn", signal: job.signal,
          logMessage: "calendar sync failed without blocking SMS processing", record: running ? async retry => {
            await actions.markFailed(job.data.scheduledActionId, retry);
            await actions.scheduleRecurringRecovery({
              failedActionId: job.data.scheduledActionId,
              userId: job.data.userId,
              kind: "sync_calendar",
              runAt: new Date(Date.now() + 60 * 60_000),
            });
          } : undefined });
      }
    }
  });
}

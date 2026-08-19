import { and, eq } from "drizzle-orm";
import { CalendarSyncRepository } from "../../domain/calendar-sync";
import { getDatabase, TempoDatabase } from "../client";
import { calendarBusyWindows, calendarConnections } from "../schema";

export class DrizzleCalendarSyncRepository implements CalendarSyncRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async getActiveConnection(userId: string) {
    const [connection] = await this.database
      .select({
        id: calendarConnections.id,
        userId: calendarConnections.userId,
        encryptedAccessToken: calendarConnections.encryptedAccessToken,
        encryptedRefreshToken: calendarConnections.encryptedRefreshToken,
        tokenExpiresAt: calendarConnections.tokenExpiresAt,
        scopes: calendarConnections.scopes,
      })
      .from(calendarConnections)
      .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.status, "active")))
      .limit(1);
    return connection?.encryptedRefreshToken ? { ...connection, encryptedRefreshToken: connection.encryptedRefreshToken } : null;
  }

  async replaceBusyWindows(input: Parameters<CalendarSyncRepository["replaceBusyWindows"]>[0]) {
    await this.database.transaction(async (transaction) => {
      await transaction.delete(calendarBusyWindows).where(eq(calendarBusyWindows.connectionId, input.connectionId));
      if (input.windows.length > 0) {
        await transaction.insert(calendarBusyWindows).values(
          input.windows.map((window) => ({
            userId: input.userId,
            connectionId: input.connectionId,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            sourceHash: window.sourceHash,
            syncedAt: input.syncedAt,
          })),
        );
      }
      await transaction
        .update(calendarConnections)
        .set({
          encryptedAccessToken: input.encryptedAccessToken,
          encryptedRefreshToken: input.encryptedRefreshToken,
          tokenExpiresAt: input.tokenExpiresAt,
          scopes: input.scopes,
          lastSyncedAt: input.syncedAt,
          updatedAt: input.syncedAt,
        })
        .where(eq(calendarConnections.id, input.connectionId));
    });
  }

  async markRequiresReauth(connectionId: string) {
    await this.database
      .update(calendarConnections)
      .set({ status: "requires_reauth", updatedAt: new Date() })
      .where(eq(calendarConnections.id, connectionId));
  }
}

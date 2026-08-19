import { eq } from "drizzle-orm";
import { AccountControlRepository } from "../../domain/account-controls";
import { getDatabase, TempoDatabase } from "../client";
import { calendarBusyWindows, calendarConnections, users } from "../schema";

export class DrizzleAccountControlRepository implements AccountControlRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async disconnectCalendar(userId: string, now: Date) {
    return this.database.transaction(async (transaction) => {
      const connections = await transaction
        .select({ id: calendarConnections.id })
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, userId));
      for (const connection of connections) {
        await transaction.delete(calendarBusyWindows).where(eq(calendarBusyWindows.connectionId, connection.id));
      }
      const disconnected = await transaction
        .update(calendarConnections)
        .set({
          status: "disconnected",
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          scopes: [],
          lastSyncedAt: null,
          disconnectedAt: now,
          updatedAt: now,
        })
        .where(eq(calendarConnections.userId, userId))
        .returning({ id: calendarConnections.id });
      return disconnected.length > 0;
    });
  }

  async deleteAccount(userId: string) {
    const deleted = await this.database.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    return deleted.length > 0;
  }
}

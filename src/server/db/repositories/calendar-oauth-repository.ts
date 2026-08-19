import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { CalendarOAuthRepository } from "../../domain/calendar-oauth";
import { getDatabase, TempoDatabase } from "../client";
import { calendarConnections, oauthStates, scheduledActions, users } from "../schema";

export class DrizzleCalendarOAuthRepository implements CalendarOAuthRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async createState(input: Parameters<CalendarOAuthRepository["createState"]>[0]) {
    await this.database.insert(oauthStates).values({
      userId: input.userId,
      stateHash: input.stateHash,
      codeVerifierEncrypted: input.encryptedCodeVerifier,
      expiresAt: input.expiresAt,
    });
  }

  async consumeState(stateHash: string, now: Date) {
    const [state] = await this.database
      .update(oauthStates)
      .set({ usedAt: now })
      .where(and(eq(oauthStates.stateHash, stateHash), isNull(oauthStates.usedAt), gt(oauthStates.expiresAt, now)))
      .returning({ userId: oauthStates.userId, encryptedCodeVerifier: oauthStates.codeVerifierEncrypted });
    return state?.encryptedCodeVerifier
      ? { userId: state.userId, encryptedCodeVerifier: state.encryptedCodeVerifier }
      : null;
  }

  async saveConnection(input: Parameters<CalendarOAuthRepository["saveConnection"]>[0]) {
    await this.database.transaction(async (transaction) => {
      await transaction
        .insert(calendarConnections)
        .values({
          userId: input.userId,
          encryptedAccessToken: input.encryptedAccessToken,
          encryptedRefreshToken: input.encryptedRefreshToken,
          tokenExpiresAt: input.tokenExpiresAt,
          scopes: input.scopes,
          status: "active",
        })
        .onConflictDoUpdate({
          target: calendarConnections.userId,
          set: {
            encryptedAccessToken: input.encryptedAccessToken,
            encryptedRefreshToken: input.encryptedRefreshToken,
            tokenExpiresAt: input.tokenExpiresAt,
            scopes: input.scopes,
            status: "active",
            disconnectedAt: null,
            updatedAt: new Date(),
          },
        });
      await transaction
        .update(users)
        .set({ onboardingState: "complete", updatedAt: new Date() })
        .where(eq(users.id, input.userId));
      const [existingSync] = await transaction.select({ id: scheduledActions.id }).from(scheduledActions).where(and(
        eq(scheduledActions.userId, input.userId),
        eq(scheduledActions.kind, "sync_calendar"),
        inArray(scheduledActions.status, ["scheduled", "running"]),
      )).limit(1);
      if (!existingSync) {
        await transaction.insert(scheduledActions).values({
          userId: input.userId,
          kind: "sync_calendar",
          payload: {},
          idempotencyKey: `calendar-sync:${input.userId}:${crypto.randomUUID()}`,
          runAt: new Date(),
        });
      }
    });
  }
}

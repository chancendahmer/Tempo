import { eq, lt, sql } from "drizzle-orm";
import { getDatabase, TempoDatabase } from "../client";
import { consentRecords, oauthStates, rateLimitBuckets, serviceHeartbeats, users } from "../schema";

export class OperationalRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async heartbeat(serviceKey: string, metadata: Record<string, unknown>, now = new Date()) {
    await this.database.insert(serviceHeartbeats).values({ serviceKey, lastSeenAt: now, metadata, updatedAt: now })
      .onConflictDoUpdate({
        target: serviceHeartbeats.serviceKey,
        set: { lastSeenAt: now, metadata, updatedAt: now },
      });
  }

  async getHeartbeat(serviceKey: string) {
    const [heartbeat] = await this.database.select().from(serviceHeartbeats)
      .where(eq(serviceHeartbeats.serviceKey, serviceKey)).limit(1);
    return heartbeat ?? null;
  }

  async countEarlyAccess() {
    const result = await this.database.execute<{ count: number }>(sql`
      select count(*)::int as count
      from ${users} as account
      where (
        select consent.status
        from ${consentRecords} as consent
        where consent.user_id = account.id
        order by consent.created_at desc, consent.id desc
        limit 1
      ) = 'granted'
    `);
    return result.rows[0]?.count ?? 0;
  }

  async consumeRateLimit(input: { key: string; limit: number; windowMs: number; now?: Date }) {
    const now = input.now ?? new Date();
    const windowStart = new Date(Math.floor(now.getTime() / input.windowMs) * input.windowMs);
    const [bucket] = await this.database.insert(rateLimitBuckets).values({
      key: input.key,
      windowStart,
      count: 1,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1`, updatedAt: now },
    }).returning({ count: rateLimitBuckets.count });
    return {
      allowed: bucket.count <= input.limit,
      remaining: Math.max(0, input.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + input.windowMs - now.getTime()) / 1000)),
    };
  }

  async cleanupExpiredData(now = new Date()) {
    return this.database.transaction(async (transaction) => {
      const oauthRows = await transaction.delete(oauthStates)
        .where(lt(oauthStates.expiresAt, now))
        .returning({ id: oauthStates.id });
      const rateLimitRows = await transaction.delete(rateLimitBuckets)
        .where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - 24 * 3_600_000)))
        .returning({ key: rateLimitBuckets.key });
      return { oauthStates: oauthRows.length, rateLimitBuckets: rateLimitRows.length };
    });
  }
}

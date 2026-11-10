import { and, desc, eq } from "drizzle-orm";
import { hashAuditValue } from "../../domain/consent";
import { FeedbackAccountUnavailable, FeedbackConflict, FeedbackRateLimited, pilotFeedbackSchema, type PilotFeedbackInput, type PilotFeedbackReceipt } from "../../domain/pilot-feedback";
import { encryptField, decryptField } from "../../security/field-encryption";
import { getDatabase, type TempoDatabase } from "../client";
import { pilotFeedback, users } from "../schema";
import { OperationalRepository } from "./operational-repository";

export class PilotFeedbackRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async submit(userId: string, input: PilotFeedbackInput, encryptionKey: string, now = new Date()): Promise<PilotFeedbackReceipt> {
    const data = pilotFeedbackSchema.parse(input);
    const payloadHmac = hashAuditValue(JSON.stringify({ userId, ...data }), encryptionKey)!;
    return this.database.transaction(async transaction => {
      // Serialize this account's retries and cap consumption. A deleted or
      // unverified account cannot submit even if its HTTP session was checked.
      const [account] = await transaction.select({ phoneVerifiedAt: users.phoneVerifiedAt, status: users.status })
        .from(users).where(eq(users.id, userId)).for("update");
      if (!account?.phoneVerifiedAt || account.status === "deleted") throw new FeedbackAccountUnavailable();
      const [prior] = await transaction.select().from(pilotFeedback).where(and(eq(pilotFeedback.userId, userId), eq(pilotFeedback.requestId, data.requestId))).limit(1);
      if (prior) {
        if (prior.payloadHmac !== payloadHmac) throw new FeedbackConflict("This report changed after an earlier submission. Start a new report to send different details.");
        return { id: prior.id, createdAt: prior.createdAt.toISOString() };
      }
      const limit = await new OperationalRepository(transaction as unknown as TempoDatabase).consumeRateLimit({
        key: `feedback-write:${userId}`, limit: 5, windowMs: 60 * 60_000, now,
      });
      if (!limit.allowed) throw new FeedbackRateLimited(limit.retryAfterSeconds);
      const [saved] = await transaction.insert(pilotFeedback).values({
        userId, requestId: data.requestId, type: data.type, section: data.section, impact: data.impact,
        encryptedDetail: data.detail ? encryptField(data.detail, encryptionKey) : null,
        followUpConsent: data.followUpConsent, payloadHmac, createdAt: now,
      }).returning({ id: pilotFeedback.id, createdAt: pilotFeedback.createdAt });
      return { id: saved.id, createdAt: saved.createdAt.toISOString() };
    });
  }

  // Receipt lookup is always account-scoped; there is no customer list/detail API.
  async receipt(userId: string, reportId: string): Promise<PilotFeedbackReceipt | null> {
    const [row] = await this.database.select({ id: pilotFeedback.id, createdAt: pilotFeedback.createdAt })
      .from(pilotFeedback).where(and(eq(pilotFeedback.userId, userId), eq(pilotFeedback.id, reportId))).limit(1);
    return row ? { id: row.id, createdAt: row.createdAt.toISOString() } : null;
  }

  async operatorReports(key: string, options: { limit?: number; reportId?: string; includeDetail?: boolean } = {}) {
    if (options.includeDetail && !options.reportId) throw new Error("Choose one report before reading its optional detail.");
    const rows = await this.database.select().from(pilotFeedback)
      .where(options.reportId ? eq(pilotFeedback.id, options.reportId) : undefined)
      .orderBy(desc(pilotFeedback.createdAt), desc(pilotFeedback.id)).limit(Math.max(1, Math.min(100, options.limit ?? 25)));
    return rows.map(row => ({
      id: row.id, account: hashAuditValue(`feedback-account:${row.userId}`, key)!.slice(0, 12),
      createdAt: row.createdAt.toISOString(), type: row.type, section: row.section, impact: row.impact,
      followUpConsent: row.followUpConsent, hasDetail: row.encryptedDetail !== null,
      ...(options.includeDetail ? { detail: row.encryptedDetail ? decryptField(row.encryptedDetail, key) : null } : {}),
    }));
  }
}

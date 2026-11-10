import { and, count, eq, inArray, lt, sql } from "drizzle-orm";
import type { MessagingProvider } from "../../adapters/sms/sms-transport";
import type { DeliveryProviderMessage } from "../../domain/messaging";
import type { TempoDatabase } from "../client";
import { conversationMessages, interventions, pendingDeliveryReceipts, providerMessageBindings, rateLimitBuckets, users } from "../schema";

const MAX_PENDING_PER_PROVIDER = 2_000;
const MAX_NEW_PER_MINUTE = 120;
const RECEIPT_TTL_MS = 24 * 60 * 60_000;
export const MAX_REPORTED_RECEIPT_DROPS_PER_MINUTE = 10_000;

// Linq can report successful delivery after an earlier failure. Once
// delivery is verified, late failure and sent events cannot replace it.
function predecessors(input: DeliveryProviderMessage) {
  if (input.status === "queued" || input.status === "sent") return ["queued"] as const;
  if (input.status === "delivered" && input.provider === "linq") return ["queued", "sent", "failed"] as const;
  return ["queued", "sent"] as const;
}

export async function lockDeliveryReceipt(transaction: TempoDatabase, provider: MessagingProvider, externalMessageId: string) {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`tempo:delivery-receipt:${provider}:${externalMessageId}`}, 0))`);
}

async function applyKnownReceipt(transaction: TempoDatabase, userId: string, input: DeliveryProviderMessage, observedAt: Date) {
  const lifecycleTimes = {
    ...(input.status === "sent" ? { sentAt: observedAt } : {}),
    ...(input.status === "delivered" ? { deliveredAt: observedAt } : {}),
  };
  const allowedStatuses = predecessors(input);
  const interventionStatus = input.status === "undelivered" ? "failed" : input.status;
  const failed = interventionStatus === "failed";
  const identity = and(eq(conversationMessages.provider, input.provider), eq(conversationMessages.providerMessageSid, input.providerMessageId));
  const [message] = await transaction.update(conversationMessages).set({
    status: input.status,
    providerErrorCode: failed ? input.errorCode ?? null : null,
    providerErrorMessage: failed ? input.errorMessage ?? null : null,
    ...lifecycleTimes,
    updatedAt: sql`greatest(${conversationMessages.updatedAt}, ${observedAt}::timestamptz)`,
  }).where(and(identity, eq(conversationMessages.userId, userId), eq(conversationMessages.direction, "outbound"), inArray(conversationMessages.status, allowedStatuses)))
    .returning({ id: conversationMessages.id });
  if (!message) return;

  await transaction.update(providerMessageBindings).set({
    deliveryStatus: input.status,
    rawMetadata: input.rawMetadata ? sql`${providerMessageBindings.rawMetadata} || ${JSON.stringify(input.rawMetadata)}::jsonb` : undefined,
    updatedAt: sql`greatest(${providerMessageBindings.updatedAt}, ${observedAt}::timestamptz)`,
  }).where(and(
    eq(providerMessageBindings.provider, input.provider), eq(providerMessageBindings.externalMessageId, input.providerMessageId),
    eq(providerMessageBindings.messageId, message.id),
  ));
  await transaction.update(interventions).set({
    status: interventionStatus,
    ...lifecycleTimes,
    updatedAt: sql`greatest(${interventions.updatedAt}, ${observedAt}::timestamptz)`,
  }).where(and(
    eq(interventions.provider, input.provider), eq(interventions.providerMessageSid, input.providerMessageId),
    eq(interventions.userId, userId), inArray(interventions.status, allowedStatuses),
  ));
}

async function receiptMessage(database: TempoDatabase, input: DeliveryProviderMessage) {
  const [message] = await database.select({ userId: conversationMessages.userId, direction: conversationMessages.direction })
    .from(conversationMessages).where(and(eq(conversationMessages.provider, input.provider),
      eq(conversationMessages.providerMessageSid, input.providerMessageId))).limit(1);
  return message;
}

export async function storeDeliveryReceipt(database: TempoDatabase, input: DeliveryProviderMessage, now: Date) {
  const prior = await receiptMessage(database, input);
  // An inbound ID must never enter the inbox.
  if (prior?.direction === "inbound") return;
  const userId = prior?.userId ?? await database.transaction(async tx => {
    const transaction = tx as unknown as TempoDatabase;
    await lockDeliveryReceipt(transaction, input.provider, input.providerMessageId);
    const current = await receiptMessage(transaction, input);
    if (current) return current.direction === "outbound" ? current.userId : undefined;
    await stageUnknownReceipt(transaction, input, now);
  });
  if (!userId) return;

  // Release the unknown-ID transaction first if acceptance won the race.
  // Known updates take the account before message/intervention rows, matching
  // markSubmitted and account deletion's cascade order.
  await database.transaction(async tx => {
    const transaction = tx as unknown as TempoDatabase;
    const [account] = await transaction.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (!account) return;
    await lockDeliveryReceipt(transaction, input.provider, input.providerMessageId);
    await applyKnownReceipt(transaction, account.id, input, now);
  });
}

async function stageUnknownReceipt(transaction: TempoDatabase, input: DeliveryProviderMessage, now: Date) {
  const { provider, providerMessageId: externalMessageId, status } = input;
  if (externalMessageId.length < 1 || externalMessageId.length > 255) return;

  const errorCode = input.errorCode && /^[A-Za-z0-9_-]{1,64}$/.test(input.errorCode) ? input.errorCode : null;
  const key = and(eq(pendingDeliveryReceipts.provider, provider), eq(pendingDeliveryReceipts.externalMessageId, externalMessageId));
  const [pending] = await transaction.select().from(pendingDeliveryReceipts).where(key).limit(1);
  if (pending) {
    if (pending.expiresAt > now && pending.status !== status && predecessors(input).some(value => value === pending.status)) {
      await transaction.update(pendingDeliveryReceipts).set({ status, errorCode, statusObservedAt: now }).where(key);
    }
    return;
  }

  // Admission of new unknown IDs has a per-provider cap. Known IDs and
  // updates to existing inbox rows never wait on this quota.
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`tempo:delivery-receipt-quota:${provider}`}, 0))`);
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [{ pendingCount }] = await transaction.select({ pendingCount: count() }).from(pendingDeliveryReceipts)
    .where(eq(pendingDeliveryReceipts.provider, provider));
  if (pendingCount >= MAX_PENDING_PER_PROVIDER) {
    await recordQuotaDrop(transaction, provider, windowStart, now);
    return;
  }
  const [admitted] = await transaction.insert(rateLimitBuckets).values({ key: `pending-delivery:${provider}`, windowStart, updatedAt: now })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1`, updatedAt: now },
      setWhere: lt(rateLimitBuckets.count, MAX_NEW_PER_MINUTE),
    }).returning({ count: rateLimitBuckets.count });
  if (!admitted) {
    await recordQuotaDrop(transaction, provider, windowStart, now);
    return;
  }
  await transaction.insert(pendingDeliveryReceipts).values({
    provider, externalMessageId, status, errorCode, firstSeenAt: now, statusObservedAt: now,
    expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS),
  });
}

async function recordQuotaDrop(transaction: TempoDatabase, provider: MessagingProvider, windowStart: Date, now: Date) {
  await transaction.insert(rateLimitBuckets).values({ key: `pending-delivery-drop:${provider}`, windowStart, updatedAt: now })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1`, updatedAt: now },
      setWhere: lt(rateLimitBuckets.count, MAX_REPORTED_RECEIPT_DROPS_PER_MINUTE),
    });
}

/** The acceptance transaction already holds the same provider/ID lock. */
export async function applyPendingDeliveryReceipt(transaction: TempoDatabase, userId: string, provider: MessagingProvider, externalMessageId: string, now: Date) {
  const [pending] = await transaction.delete(pendingDeliveryReceipts)
    .where(and(eq(pendingDeliveryReceipts.provider, provider), eq(pendingDeliveryReceipts.externalMessageId, externalMessageId))).returning();
  if (!pending || pending.expiresAt <= now) return;
  await applyKnownReceipt(transaction, userId, {
    provider, providerMessageId: externalMessageId, status: pending.status, errorCode: pending.errorCode ?? undefined,
  }, pending.statusObservedAt);
}

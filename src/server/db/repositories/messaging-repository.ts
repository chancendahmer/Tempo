import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { PRIVACY_VERSION, SMS_DISCLOSURE_VERSION, TERMS_VERSION } from "../../domain/consent";
import { MessagingRepository } from "../../domain/messaging";
import { normalizeE164 } from "../../domain/phone";
import { getDatabase, TempoDatabase } from "../client";
import {
  consentRecords,
  conversations,
  conversationMessages,
  interventions,
  memoryEntries,
  messageRelations,
  providerMessageBindings,
  scheduledActions,
  users,
  webSessions,
} from "../schema";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { getServerEnv } from "../../config/env";
import { isVerifiedExistingPilotAccount, pilotAdmissionAllowed, type PilotAdmissionPolicy } from "../../domain/pilot-admission";
import { storeDeliveryReceipt } from "./delivery-receipts";

async function cancelPendingWork(transaction: TempoDatabase, userId: string, now: Date) {
  // An inbound action can already have been dispatched while its source still
  // awaits a worker. Cancel that SMS source as well as undispatched sources.
  const cancelled = await transaction.update(conversationMessages).set({ status: "cancelled", updatedAt: now }).where(and(
    eq(conversationMessages.userId, userId), eq(conversationMessages.direction, "inbound"), eq(conversationMessages.status, "received"),
    sql`exists (
      select 1 from ${scheduledActions}
      where ${scheduledActions.userId} = ${userId}
        and ${scheduledActions.kind} = 'process_inbound_message'
        and ${scheduledActions.payload}->>'messageId' = ${conversationMessages.id}::text
        and (${scheduledActions.status} = 'scheduled'
          or (${scheduledActions.status} = 'running' and ${conversationMessages.provider} is not null))
    )`,
  )).returning({ id: conversationMessages.id });
  await transaction.update(scheduledActions).set({ status: "cancelled", updatedAt: now }).where(and(
    eq(scheduledActions.userId, userId),
    or(eq(scheduledActions.status, "scheduled"), and(
      eq(scheduledActions.status, "running"), eq(scheduledActions.kind, "process_inbound_message"),
      inArray(sql`${scheduledActions.payload}->>'messageId'`, cancelled.map(message => message.id)),
    )),
  ));
}

export class DrizzleMessagingRepository implements MessagingRepository {
  constructor(private readonly database: TempoDatabase = getDatabase(), private readonly admission?: PilotAdmissionPolicy) {}

  async ingestInbound(input: Parameters<MessagingRepository["ingestInbound"]>[0]) {
    const phoneE164 = normalizeE164(input.from);
    const now = new Date();
    const normalizedBody = input.body.trim().toUpperCase();
    const detectedKeyword = input.complianceKeyword
      ?? (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalizedBody)
        ? "STOP"
        : ["START", "UNSTOP"].includes(normalizedBody)
          ? "START"
          : ["HELP", "INFO"].includes(normalizedBody)
            ? "HELP"
            : undefined);

    return this.database.transaction(async (transaction) => {
      const policy = this.admission ?? getServerEnv();
      const accountFields = {
        id: users.id, status: users.status, pausedUntil: users.pausedUntil,
        onboardingState: users.onboardingState, lastInboundAt: users.lastInboundAt, phoneVerifiedAt: users.phoneVerifiedAt,
      };
      const lockAccount = () => transaction.select(accountFields).from(users).where(eq(users.phoneE164, phoneE164)).for("update");
      const [existing] = await lockAccount();
      if (existing && detectedKeyword === "STOP") {
        // A STOP saved before admission can be replayed after an invitation or
        // later START. Admission changes must not change event idempotency.
        const [priorStop] = await transaction.select({ id: consentRecords.id }).from(consentRecords).where(and(
          eq(consentRecords.userId, existing.id), eq(consentRecords.channel, "sms"),
          sql`${consentRecords.evidence}->>'provider' = ${input.provider}`,
          sql`${consentRecords.evidence}->>'providerMessageId' = ${input.providerMessageId}`,
        )).limit(1);
        if (priorStop) return { duplicate: true };
      }
      const admitted = pilotAdmissionAllowed(policy, phoneE164, isVerifiedExistingPilotAccount(existing));
      const pauseRequested = /^(leave me alone|back off|don'?t text me)(?:[.!\s]*)$/i.test(input.body.trim());
      if (!admitted && detectedKeyword === "STOP") {
        // Preserve carrier suppression even before admission. This compliance-
        // only account is never verified, activated or sent an onboarding text.
        await transaction.insert(users).values({ phoneE164, status: "opted_out", optedOutAt: now })
          .onConflictDoNothing({ target: users.phoneE164 });
        const [owner] = await transaction.select({ id: users.id }).from(users)
          .where(eq(users.phoneE164, phoneE164)).for("update");
        const [duplicateStop] = await transaction.select({ id: consentRecords.id }).from(consentRecords).where(and(
          eq(consentRecords.userId, owner.id), eq(consentRecords.channel, "sms"),
          sql`${consentRecords.evidence}->>'provider' = ${input.provider}`,
          sql`${consentRecords.evidence}->>'providerMessageId' = ${input.providerMessageId}`,
        )).limit(1);
        if (duplicateStop) return { duplicate: true };
        await transaction.insert(consentRecords).values({
          userId: owner.id, status: "revoked", channel: "sms",
          disclosureVersion: SMS_DISCLOSURE_VERSION, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
          evidence: { keyword: "STOP", provider: input.provider, providerMessageId: input.providerMessageId },
        });
        await transaction.update(users).set({ status: "opted_out", optedOutAt: now, updatedAt: now }).where(eq(users.id, owner.id));
        await cancelPendingWork(transaction as unknown as TempoDatabase, owner.id, now);
        await transaction.update(interventions).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(and(
          eq(interventions.userId, owner.id), inArray(interventions.status, ["candidate", "queued"]),
        ));
        return { duplicate: false };
      }
      // No account, conversation, message, model job or rejection text for a
      // rejected sender. Replays have the same no-op result and can be ACKed.
      if (!admitted && (!existing || (detectedKeyword !== "STOP" && detectedKeyword !== "HELP" && !pauseRequested))) {
        return { duplicate: true };
      }
      const [createdUser] = existing ? [] : await transaction
        .insert(users)
        .values({ phoneE164 })
        .onConflictDoNothing({ target: users.phoneE164 })
        .returning(accountFields);
      const user = existing ?? createdUser ?? (await lockAccount())[0];
      const [pendingSession] = detectedKeyword === "START" ? await transaction.select({ id: webSessions.id })
        .from(webSessions).where(and(eq(webSessions.userId, user.id), isNull(webSessions.activatedAt),
          isNull(webSessions.revokedAt), gt(webSessions.createdAt, new Date(now.getTime() - 30 * 60_000)),
          gt(webSessions.expiresAt, now))).limit(1) : [];
      const signingIn = Boolean(pendingSession) && user.phoneVerifiedAt != null && user.status !== "opted_out";
      const complianceKeyword = detectedKeyword === "START" && !signingIn &&
        input.complianceKeyword !== "START" &&
        user.status !== "opted_out" &&
        user.onboardingState !== "awaiting_consent" &&
        user.lastInboundAt !== null
        ? undefined
        : detectedKeyword;

      const identity = await ensureDirectConversation(transaction as unknown as TempoDatabase, {
        userId: user.id,
        phoneE164,
        phoneVerifiedAt: admitted && !user.phoneVerifiedAt ? now : undefined,
        provider: input.provider,
        providerLineAddress: normalizeE164(input.to),
        providerConversationId: input.providerConversationId,
        providerThreadId: input.providerThreadId,
        service: input.service,
        capabilities: input.capabilities,
      });

      const [message] = await transaction
        .insert(conversationMessages)
        .values({
          userId: user.id,
          conversationId: identity.conversationId,
          provider: input.provider,
          providerService: input.service,
          providerMessageSid: input.providerMessageId,
          direction: "inbound",
          kind: complianceKeyword ? "compliance" : "user",
          status: "received",
          body: input.body,
          contentParts: input.contentParts ?? [{ type: "text", value: input.body }],
          receivedAt: now,
        })
        .onConflictDoNothing({
          target: [conversationMessages.provider, conversationMessages.providerMessageSid],
        })
        .returning({ id: conversationMessages.id });

      if (!message) return { duplicate: true };

      await transaction.insert(providerMessageBindings).values({
        messageId: message.id,
        providerConversationId: identity.providerConversationId,
        provider: input.provider,
        externalMessageId: input.providerMessageId,
        externalThreadId: input.providerThreadId,
        deliveryStatus: "received",
        rawMetadata: input.rawMetadata ?? {},
      }).onConflictDoNothing({
        target: [providerMessageBindings.provider, providerMessageBindings.externalMessageId],
      });
      if (input.replyToProviderMessageId) {
        const [target] = await transaction.select({ messageId: providerMessageBindings.messageId })
          .from(providerMessageBindings)
          .innerJoin(conversationMessages, eq(conversationMessages.id, providerMessageBindings.messageId))
          .where(and(
            eq(providerMessageBindings.provider, input.provider),
            eq(providerMessageBindings.externalMessageId, input.replyToProviderMessageId),
            eq(conversationMessages.userId, user.id),
            eq(conversationMessages.conversationId, identity.conversationId),
          ))
          .limit(1);
        if (target && target.messageId !== message.id) {
          await transaction.insert(messageRelations).values({
            conversationId: identity.conversationId,
            sourceMessageId: message.id,
            targetMessageId: target.messageId,
            type: "reply",
          }).onConflictDoNothing();
        }
      }
      await transaction.update(conversations).set({ lastMessageAt: now, updatedAt: now })
        .where(eq(conversations.id, identity.conversationId));

      await transaction.update(users).set({
        lastInboundAt: now,
        ...(admitted && !user.phoneVerifiedAt ? { phoneVerifiedAt: now } : {}),
        updatedAt: now,
      }).where(eq(users.id, user.id));
      const activatedSessions = admitted ? await transaction.update(webSessions).set({ activatedAt: now, updatedAt: now }).where(and(
        eq(webSessions.userId, user.id),
        isNull(webSessions.activatedAt),
        isNull(webSessions.revokedAt),
        gt(webSessions.createdAt, new Date(now.getTime() - 30 * 60_000)),
        gt(webSessions.expiresAt, now),
        // A normal text must never approve a browser awaiting an explicit sign-in link.
        sql`not exists (select 1 from ${scheduledActions} where ${scheduledActions.kind} = 'send_signin'
          and ${scheduledActions.userId} = ${user.id}
          and ${scheduledActions.payload}->>'sessionId' = ${webSessions.id}::text)`,
      )).returning({ id: webSessions.id }) : [];

      if (signingIn) {
        await transaction.update(conversationMessages).set({ status: "processed", updatedAt: now })
          .where(eq(conversationMessages.id, message.id));
        await transaction.insert(scheduledActions).values({
          userId: user.id, kind: "send_compliance", payload: { signInConfirmed: activatedSessions.length > 0, signInLinkRequired: activatedSessions.length === 0 },
          idempotencyKey: `signin-confirmed:${input.provider}:${input.providerMessageId}`, runAt: now,
        }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
        return { duplicate: false };
      }

      if (complianceKeyword === "STOP" || complianceKeyword === "START") {
        await transaction.update(conversationMessages).set({status:"processed",updatedAt:now}).where(eq(conversationMessages.id,message.id));
        const granted = complianceKeyword === "START";
        await transaction.insert(consentRecords).values({
          userId: user.id,
          status: granted ? "granted" : "revoked",
          channel: "sms",
          disclosureVersion: SMS_DISCLOSURE_VERSION,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          evidence: {
            keyword: complianceKeyword,
            provider: input.provider,
            providerMessageId: input.providerMessageId,
            service: input.service,
          },
        });
        await transaction
          .update(users)
          .set({
            status: granted ? "active" : "opted_out",
            optedOutAt: granted ? null : now,
            pausedUntil: null,
            updatedAt: now,
          })
          .where(eq(users.id, user.id));

        if (granted) {
          await transaction.update(users).set({ onboardingState: "introduction", updatedAt: now }).where(and(
            eq(users.id, user.id),
            eq(users.onboardingState, "awaiting_consent"),
          ));
          await transaction.insert(scheduledActions).values([
            {
              userId: user.id,
              kind: "send_welcome",
              payload: {},
              idempotencyKey: `welcome:${user.id}:messaging-start:${input.provider}:${input.providerMessageId}`,
              runAt: now,
            },
            {
              userId: user.id,
              kind: "evaluate_context",
              payload: {},
              idempotencyKey: `context-evaluation:${user.id}:initial`,
              runAt: now,
            },
          ]).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
        }

        if (!granted) {
          await cancelPendingWork(transaction as unknown as TempoDatabase, user.id, now);
          await transaction
            .update(interventions)
            .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
            .where(
              and(
                eq(interventions.userId, user.id),
                inArray(interventions.status, ["candidate", "queued"]),
              ),
            );
        }

        return { duplicate: false };
      }

      if (pauseRequested) {
        const pausedUntil = new Date(now.getTime() + 7 * 86_400_000);
        const [paused] = await transaction.update(users).set({
          status: sql`case when ${users.status} = 'opted_out' then ${users.status} else 'active'::user_status end`,
          pausedUntil, updatedAt: now,
        }).where(eq(users.id, user.id)).returning({ status: users.status });
        await transaction.update(conversationMessages).set({ status: "processed", updatedAt: now }).where(eq(conversationMessages.id, message.id));
        await cancelPendingWork(transaction as unknown as TempoDatabase, user.id, now);
        await transaction.update(interventions).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(and(
          eq(interventions.userId, user.id), inArray(interventions.status, ["candidate", "queued"]),
        ));
        await transaction.insert(memoryEntries).values({
          userId: user.id,
          category: "preference",
          content: "The user asked Tempo to back off; keep intervention frequency low until they explicitly resume.",
          confidence: 1,
          sourceMessageId: message.id,
          lastConfirmedAt: now,
          expiresAt: pausedUntil,
        });
        if (admitted && paused.status !== "opted_out") await transaction.insert(scheduledActions).values({
          userId: user.id,
          kind: "evaluate_context",
          payload: {},
          idempotencyKey: `context-resume:${user.id}:${input.provider}:${input.providerMessageId}`,
          runAt: pausedUntil,
        }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
        return { duplicate: false };
      }

      const resumeRequested = (user.status === "active" || user.status === "paused")
        && /^(resume|come back|text me again|start coaching again)(?:[.!\s]*)$/i.test(input.body.trim());
      if (resumeRequested) {
        await transaction.update(users).set({ status: "active", pausedUntil: null, updatedAt: now }).where(eq(users.id, user.id));
        await transaction.update(scheduledActions).set({ status: "cancelled", updatedAt: now }).where(and(
          eq(scheduledActions.userId, user.id),
          eq(scheduledActions.kind, "evaluate_context"),
          eq(scheduledActions.status, "scheduled"),
        ));
        await transaction.insert(scheduledActions).values({
          userId: user.id,
          kind: "evaluate_context",
          payload: {},
          idempotencyKey: `context-resumed:${user.id}:${input.provider}:${input.providerMessageId}`,
          runAt: now,
        }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      }

      if (complianceKeyword === "HELP") {
        await transaction.update(conversationMessages).set({status:"processed",updatedAt:now}).where(eq(conversationMessages.id,message.id));
        await transaction
          .insert(scheduledActions)
          .values({
            userId: user.id,
            kind: "send_compliance",
            idempotencyKey: `help:${input.provider}:${input.providerMessageId}`,
            payload: {},
            runAt: now,
          })
          .onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      } else if (user.status === "opted_out" || user.status === "deleted" ||
        (!resumeRequested && (user.status === "paused" || (user.pausedUntil && user.pausedUntil > now)))) {
        await transaction.update(conversationMessages).set({ status: "cancelled", updatedAt: now })
          .where(eq(conversationMessages.id, message.id));
      } else if (!user.phoneVerifiedAt && user.onboardingState === "introduction") {
        await transaction.update(conversationMessages).set({status:"processed",updatedAt:now}).where(eq(conversationMessages.id,message.id));
        await transaction.insert(scheduledActions).values([
          {
            userId: user.id,
            kind: "send_welcome",
            idempotencyKey: `welcome:${user.id}:verified:${input.provider}:${input.providerMessageId}`,
            payload: {},
            runAt: now,
          },
          {
            userId: user.id,
            kind: "evaluate_context",
            idempotencyKey: `context-evaluation:${user.id}:verified`,
            payload: {},
            runAt: now,
          },
        ]).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      } else {
        await transaction
          .insert(scheduledActions)
          .values({
            userId: user.id,
            kind: "process_inbound_message",
            idempotencyKey: `inbound:${input.provider}:${input.providerMessageId}`,
            payload: { messageId: message.id },
            runAt: now,
          })
          .onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      }

      return { duplicate: false };
    });
  }

  async updateDelivery(input: Parameters<MessagingRepository["updateDelivery"]>[0]) {
    await storeDeliveryReceipt(this.database, input, new Date());
  }
}

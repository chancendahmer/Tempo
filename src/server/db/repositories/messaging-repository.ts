import { and, eq, gt, inArray, isNull } from "drizzle-orm";
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

export class DrizzleMessagingRepository implements MessagingRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

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
      const [createdUser] = await transaction
        .insert(users)
        .values({ phoneE164 })
        .onConflictDoNothing({ target: users.phoneE164 })
        .returning({ id: users.id, status: users.status, pausedUntil: users.pausedUntil, onboardingState: users.onboardingState, lastInboundAt: users.lastInboundAt });
      const user = createdUser
        ? createdUser
        : (await transaction.select({
          id: users.id,
          status: users.status,
          pausedUntil: users.pausedUntil,
          onboardingState: users.onboardingState,
          lastInboundAt: users.lastInboundAt,
        })
          .from(users).where(eq(users.phoneE164, phoneE164)).limit(1))[0];
      const complianceKeyword = detectedKeyword === "START" &&
        input.complianceKeyword !== "START" &&
        user.status !== "opted_out" &&
        user.onboardingState !== "awaiting_consent" &&
        user.lastInboundAt !== null
        ? undefined
        : detectedKeyword;

      const identity = await ensureDirectConversation(transaction as unknown as TempoDatabase, {
        userId: user.id,
        phoneE164,
        phoneVerifiedAt: user.lastInboundAt === null ? now : undefined,
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
          .where(and(
            eq(providerMessageBindings.provider, input.provider),
            eq(providerMessageBindings.externalMessageId, input.replyToProviderMessageId),
          ))
          .limit(1);
        if (target) {
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
        ...(user.lastInboundAt === null ? { phoneVerifiedAt: now } : {}),
        updatedAt: now,
      }).where(eq(users.id, user.id));
      await transaction.update(webSessions).set({ activatedAt: now, updatedAt: now }).where(and(
        eq(webSessions.userId, user.id),
        isNull(webSessions.activatedAt),
        isNull(webSessions.revokedAt),
        gt(webSessions.createdAt, new Date(now.getTime() - 30 * 60_000)),
        gt(webSessions.expiresAt, now),
      ));

      if (complianceKeyword === "STOP" || complianceKeyword === "START") {
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
          await transaction
            .update(scheduledActions)
            .set({ status: "cancelled", updatedAt: now })
            .where(and(eq(scheduledActions.userId, user.id), eq(scheduledActions.status, "scheduled")));
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

      if (/^(leave me alone|back off|don'?t text me)(?:[.!\s]*)$/i.test(input.body.trim())) {
        const pausedUntil = new Date(now.getTime() + 7 * 86_400_000);
        await transaction.update(users).set({ status: "active", pausedUntil, updatedAt: now }).where(eq(users.id, user.id));
        await transaction.update(conversationMessages).set({ status: "processed", updatedAt: now }).where(eq(conversationMessages.id, message.id));
        await transaction.update(scheduledActions).set({ status: "cancelled", updatedAt: now }).where(and(
          eq(scheduledActions.userId, user.id), eq(scheduledActions.status, "scheduled"),
        ));
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
        await transaction.insert(scheduledActions).values({
          userId: user.id,
          kind: "evaluate_context",
          payload: {},
          idempotencyKey: `context-resume:${user.id}:${input.provider}:${input.providerMessageId}`,
          runAt: pausedUntil,
        }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
        return { duplicate: false };
      }

      if (
        user.status !== "opted_out" &&
        /^(resume|come back|text me again|start coaching again)(?:[.!\s]*)$/i.test(input.body.trim())
      ) {
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
      } else if (user.lastInboundAt === null && user.onboardingState === "introduction") {
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
    const now = new Date();
    const lifecycleTimes = {
      ...(input.status === "sent" ? { sentAt: now } : {}),
      ...(input.status === "delivered" ? { deliveredAt: now } : {}),
    };

    const allowedMessageStatuses = input.status === "queued"
      ? ["queued"] as const
      : input.status === "sent"
        ? ["queued"] as const
        : input.status === "delivered"
          ? ["queued", "sent"] as const
          : ["queued", "sent"] as const;
    const interventionStatus = input.status === "undelivered" ? "failed" : input.status;
    const allowedInterventionStatuses = interventionStatus === "queued"
      ? ["queued"] as const
      : interventionStatus === "sent"
        ? ["queued"] as const
        : interventionStatus === "delivered"
          ? ["queued", "sent"] as const
          : ["queued", "sent"] as const;

    await this.database.transaction(async (transaction) => {
      await transaction
        .update(conversationMessages)
        .set({
          status: input.status,
          providerErrorCode: input.errorCode,
          providerErrorMessage: input.errorMessage,
          ...lifecycleTimes,
          updatedAt: now,
        })
        .where(and(
          eq(conversationMessages.provider, input.provider),
          eq(conversationMessages.providerMessageSid, input.providerMessageId),
          inArray(conversationMessages.status, allowedMessageStatuses),
        ));

      await transaction
        .update(providerMessageBindings)
        .set({
          deliveryStatus: input.status,
          rawMetadata: input.rawMetadata ?? {},
          updatedAt: now,
        })
        .where(and(
          eq(providerMessageBindings.provider, input.provider),
          eq(providerMessageBindings.externalMessageId, input.providerMessageId),
        ));

      await transaction
        .update(interventions)
        .set({
          status: interventionStatus,
          ...lifecycleTimes,
          updatedAt: now,
        })
        .where(and(
          eq(interventions.provider, input.provider),
          eq(interventions.providerMessageSid, input.providerMessageId),
          inArray(interventions.status, allowedInterventionStatuses),
        ));
    });
  }
}

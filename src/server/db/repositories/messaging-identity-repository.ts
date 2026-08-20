import { and, eq } from "drizzle-orm";
import { MessagingCapabilities, MessagingProvider, MessagingService } from "../../adapters/sms/sms-transport";
import { normalizeE164 } from "../../domain/phone";
import { TempoDatabase } from "../client";
import {
  conversationParticipants,
  conversations,
  providerAccounts,
  providerConversations,
  providerLines,
  userIdentities,
} from "../schema";

export type EnsureDirectConversationInput = {
  userId: string;
  phoneE164: string;
  phoneVerifiedAt?: Date | null;
  provider?: MessagingProvider;
  providerLineAddress?: string;
  providerConversationId?: string;
  providerThreadId?: string;
  service?: MessagingService;
  capabilities?: MessagingCapabilities;
};

export type DirectConversationIdentity = {
  conversationId: string;
  userIdentityId: string;
  providerConversationId?: string;
  providerExternalKey?: string;
};

function directExternalKey(input: Required<Pick<EnsureDirectConversationInput, "provider" | "providerLineAddress">> & {
  phoneE164: string;
  providerConversationId?: string;
}) {
  return input.providerConversationId
    ? `chat:${input.providerConversationId}`
    : `direct:${normalizeE164(input.providerLineAddress)}:${normalizeE164(input.phoneE164)}`;
}

export async function ensureDirectConversation(
  database: TempoDatabase,
  input: EnsureDirectConversationInput,
): Promise<DirectConversationIdentity> {
  const phoneE164 = normalizeE164(input.phoneE164);
  const [createdIdentity] = await database.insert(userIdentities).values({
    userId: input.userId,
    type: "phone",
    value: phoneE164,
    normalizedValue: phoneE164,
    isPrimary: true,
    verifiedAt: input.phoneVerifiedAt ?? null,
  }).onConflictDoUpdate({
    target: [userIdentities.type, userIdentities.normalizedValue],
    set: {
      value: phoneE164,
      isPrimary: true,
      ...(input.phoneVerifiedAt ? { verifiedAt: input.phoneVerifiedAt } : {}),
      revokedAt: null,
      updatedAt: new Date(),
    },
  }).returning({ id: userIdentities.id, userId: userIdentities.userId });
  const identity = createdIdentity ?? (await database.select({ id: userIdentities.id, userId: userIdentities.userId }).from(userIdentities).where(and(
    eq(userIdentities.type, "phone"),
    eq(userIdentities.normalizedValue, phoneE164),
  )).limit(1))[0];
  if (!identity) throw new Error("Tempo phone identity could not be resolved");
  if (identity.userId !== input.userId) throw new Error("Tempo phone identity belongs to a different user");

  await database.insert(conversations).values({
    ownerUserId: input.userId,
    type: "direct",
    status: "active",
    isPrimary: true,
  }).onConflictDoNothing();
  const [conversation] = await database.select({ id: conversations.id }).from(conversations).where(and(
    eq(conversations.ownerUserId, input.userId),
    eq(conversations.type, "direct"),
    eq(conversations.isPrimary, true),
  )).limit(1);
  if (!conversation) throw new Error("Tempo primary conversation could not be resolved");

  await database.insert(conversationParticipants).values({
    conversationId: conversation.id,
    userIdentityId: identity.id,
    role: "user",
    address: phoneE164,
    normalizedAddress: phoneE164,
  }).onConflictDoNothing();
  await database.insert(conversationParticipants).values({
    conversationId: conversation.id,
    role: "tempo",
    displayName: "Tempo",
  }).onConflictDoNothing();

  if (!input.provider || !input.providerLineAddress) {
    return { conversationId: conversation.id, userIdentityId: identity.id };
  }

  const lineAddress = normalizeE164(input.providerLineAddress);
  await database.insert(providerAccounts).values({
    provider: input.provider,
    accountKey: "default",
  }).onConflictDoNothing();
  const [account] = await database.select({ id: providerAccounts.id }).from(providerAccounts).where(and(
    eq(providerAccounts.provider, input.provider),
    eq(providerAccounts.accountKey, "default"),
  )).limit(1);
  if (!account) throw new Error("Messaging provider account could not be resolved");

  await database.insert(providerLines).values({
    providerAccountId: account.id,
    provider: input.provider,
    address: lineAddress,
    capabilities: input.capabilities ?? {},
  }).onConflictDoUpdate({
    target: [providerLines.provider, providerLines.address],
    set: {
      providerAccountId: account.id,
      capabilities: input.capabilities ?? {},
      status: "active",
      updatedAt: new Date(),
    },
  });
  const [line] = await database.select({ id: providerLines.id }).from(providerLines).where(and(
    eq(providerLines.provider, input.provider),
    eq(providerLines.address, lineAddress),
  )).limit(1);
  if (!line) throw new Error("Messaging provider line could not be resolved");

  const externalKey = directExternalKey({
    provider: input.provider,
    providerLineAddress: lineAddress,
    phoneE164,
    providerConversationId: input.providerConversationId,
  });
  await database.insert(providerConversations).values({
    conversationId: conversation.id,
    providerLineId: line.id,
    provider: input.provider,
    externalKey,
    providerChatId: input.providerConversationId,
    providerThreadId: input.providerThreadId,
    service: input.service,
    capabilities: input.capabilities ?? {},
    lastSyncedAt: new Date(),
  }).onConflictDoUpdate({
    target: [providerConversations.provider, providerConversations.externalKey],
    set: {
      conversationId: conversation.id,
      providerLineId: line.id,
      providerChatId: input.providerConversationId,
      providerThreadId: input.providerThreadId,
      service: input.service,
      capabilities: input.capabilities ?? {},
      active: true,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const [providerConversation] = await database.select({ id: providerConversations.id }).from(providerConversations).where(and(
    eq(providerConversations.provider, input.provider),
    eq(providerConversations.externalKey, externalKey),
  )).limit(1);
  if (!providerConversation) throw new Error("Provider conversation binding could not be resolved");

  return {
    conversationId: conversation.id,
    userIdentityId: identity.id,
    providerConversationId: providerConversation.id,
    providerExternalKey: externalKey,
  };
}

import { and, eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { DrizzleOutboundMessageRepository } from "../db/repositories/outbound-message-repository";
import { DrizzleConversationHistoryRepository } from "../db/repositories/conversation-history-repository";
import { ensureDirectConversation } from "../db/repositories/messaging-identity-repository";
import { conversationMessages, messageRelations } from "../db/schema";

it("stores one account-owned reply link atomically and rejects conflicting duplicate parents", async () => {
  const simulation = await createAssistantSimulator({ parse: async () => ({ kind: "conversation", reply: "Unused" }) });
  try {
    const person = await simulation.user(), other = await simulation.user();
    const identity = await ensureDirectConversation(simulation.database, { userId: person.id, phoneE164: (await person.state()).user.phoneE164 });
    const otherIdentity = await ensureDirectConversation(simulation.database, { userId: other.id, phoneE164: (await other.state()).user.phoneE164 });
    const parents = await simulation.database.insert(conversationMessages).values([
      { userId: person.id, conversationId: identity.conversationId, direction: "inbound" as const, kind: "user" as const, status: "processed" as const, body: "Remind me to drink water" },
      { userId: person.id, conversationId: identity.conversationId, direction: "inbound" as const, kind: "user" as const, status: "processed" as const, body: "Different request" },
      { userId: other.id, conversationId: otherIdentity.conversationId, direction: "inbound" as const, kind: "user" as const, status: "processed" as const, body: "Other account" },
    ]).returning();
    const repository = new DrizzleOutboundMessageRepository(simulation.database);
    const input = { userId: person.id, body: "Want one at 5 PM too?", kind: "coach" as const, idempotencyKey: "reply-link-test", replyToMessageId: parents[0].id };
    const first = await repository.reserve(input);
    expect(await repository.reserve(input)).toEqual({ messageId: first.messageId, duplicate: true });
    await expect(repository.reserve({ ...input, replyToMessageId: parents[1].id })).rejects.toThrow("Conflicting outbound reply source");
    await expect(repository.reserve({ ...input, idempotencyKey: "invalid-foreign", replyToMessageId: parents[2].id })).rejects.toThrow("Invalid outbound reply source");
    await expect(repository.reserve({ ...input, idempotencyKey: "invalid-outbound", replyToMessageId: first.messageId })).rejects.toThrow("Invalid outbound reply source");
    await expect(repository.reserve({ ...input, userId: other.id, replyToMessageId: parents[2].id })).rejects.toThrow("Outbound idempotency conflict");
    const replies = await simulation.database.select().from(conversationMessages).where(eq(conversationMessages.direction, "outbound"));
    expect(replies.map(row => row.id)).toEqual([first.messageId]);
    expect(await simulation.database.select().from(messageRelations)).toMatchObject([{ sourceMessageId: first.messageId, targetMessageId: parents[0].id }]);
  } finally { await simulation.close(); }
}, 30_000);

it("retains accepted linked replies across sub-millisecond arrivals and queued follow-ups", async () => {
  const simulation = await createAssistantSimulator({ parse: async () => ({ kind: "conversation", reply: "Unused" }) });
  try {
    const person = await simulation.user();
    const identity = await ensureDirectConversation(simulation.database, { userId: person.id, phoneE164: (await person.state()).user.phoneE164 });
    const [parent, followup] = await simulation.database.insert(conversationMessages).values([
      { userId: person.id, conversationId: identity.conversationId, direction: "inbound" as const, kind: "user" as const, status: "processed" as const, body: "Remind me to drink water" },
      { userId: person.id, conversationId: identity.conversationId, direction: "inbound" as const, kind: "user" as const, status: "received" as const, body: "set 5PM too" },
    ]).returning();
    const reservation = await new DrizzleOutboundMessageRepository(simulation.database).reserve({ userId: person.id, body: "Want one at 5 PM too?", kind: "coach", idempotencyKey: "precision-reply", replyToMessageId: parent.id });
    const history = new DrizzleConversationHistoryRepository(simulation.database);
    await simulation.database.execute(sql`update conversation_messages set created_at = '2026-09-03T12:00:00.000111Z' where id = ${parent.id}`);
    await simulation.database.execute(sql`update conversation_messages set created_at = '2026-09-03T12:00:01.000222Z', provider_message_sid = 'accepted-reply' where id = ${reservation.messageId}`);
    await simulation.database.execute(sql`update conversation_messages set created_at = '2026-09-03T12:00:01.000333Z' where id = ${followup.id}`);
    const read = () => history.getRecent({ conversationId: identity.conversationId, beforeMessageId: followup.id, limit: 12 });
    expect((await read()).map(row => row.id)).toEqual([parent.id, reservation.messageId]);
    // The reply completed after the next inbound arrived but before it is processed.
    await simulation.database.execute(sql`update conversation_messages set created_at = '2026-09-03T12:00:00.500000Z' where id = ${followup.id}`);
    expect((await read()).map(row => row.id)).toEqual([parent.id, reservation.messageId]);
    expect((await read())[1].replyToMessageId).toBe(parent.id);
    // A reserved message that has not reached the provider never supplies context.
    await simulation.database.update(conversationMessages).set({ providerMessageSid: null }).where(and(eq(conversationMessages.id, reservation.messageId), eq(conversationMessages.userId, person.id)));
    expect((await read()).map(row => row.id)).toEqual([parent.id]);
  } finally { await simulation.close(); }
}, 30_000);

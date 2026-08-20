# Messaging provider architecture

Tempo owns account identity, conversation history, message relationships, and agent state. Messaging vendors are delivery adapters. A provider outage, number change, or provider migration must not change a Tempo user ID or erase product memory.

## Source-of-truth model

```text
users
  ├─ user_identities
  ├─ tasks / goals / memory_entries / calendar_connections
  └─ conversations
       ├─ conversation_participants
       ├─ conversation_messages
       │    ├─ provider_message_bindings
       │    └─ message_relations
       ├─ conversation_states
       ├─ conversation_polls / options / responses
       └─ provider_conversations
             └─ provider_lines
                   └─ provider_accounts
```

Internal UUIDs are authoritative. Provider chat, thread, message, account, and line identifiers are bindings only. The same Tempo conversation can have a Sendblue binding during the pilot and a Linq binding after cutover.

## Required adapter behavior

Every adapter implements text delivery and declares the features its current Tempo integration can actually use. Platform marketing claims do not enable a capability by themselves. A feature becomes available only after the adapter method, webhook normalization, persistence, fallback, and contract tests exist.

Capabilities currently modeled:

- text and media
- contact cards
- reactions
- typing indicators and read receipts
- inline replies
- groups
- polls
- voice messages
- location
- interactive cards

Callers must check capabilities and provide a plain-message fallback. For example, an unavailable native poll becomes a numbered text choice. Capabilities can later be persisted per provider line and per provider conversation because protocol fallbacks may change what one chat supports.

## Webhook normalization

Provider webhooks are authenticated before parsing. Parsers map provider payloads into Tempo message and delivery inputs containing optional chat, thread, reply, content-part, capability, and trace metadata. Repositories then attach those events to Tempo-owned identities and conversations.

Signed or temporary attachment URLs are not retained in conversation history. Store durable provider attachment IDs and safe metadata; fetch content only through an authorized, bounded ingestion flow when a product feature requires it.

## Conversation history for AI

The AI reads a bounded window of Tempo `conversation_messages`, not a provider transcript API. This works during the Sendblue pilot even when the line does not expose threads. When a provider supplies `reply_to` or thread metadata, `message_relations` adds structure to the same history; it does not replace it.

## Provider cutover checklist

1. Add the provider account and line in staging.
2. Verify webhook signatures, replay protection, idempotency, and lifecycle ordering.
3. Run the shared transport and webhook contract tests.
4. Test service fallback, STOP/START/HELP, media, replies, delivery failures, and rate limits.
5. Verify chat/message IDs are persisted as bindings and the Tempo conversation UUID stays unchanged.
6. Keep the old adapter configured for rollback until the new line is stable.
7. Change `MESSAGING_PROVIDER` only after the worker and web service share the new credentials.

The ten-person Sendblue pilot may use a different phone number from the eventual Linq deployment. Users can be re-onboarded to the new number without migrating their Tempo account, tasks, memory, or historical messages.

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

async function applyMigration(client: PGlite, file: string) {
  const migration = (await readFile(resolve(process.cwd(), "drizzle", file), "utf8"))
    .replaceAll("--> statement-breakpoint", "");
  await client.exec(migration);
}

describe("provider-independent messaging migration", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("backfills legacy users, messages, and agent state into Tempo conversations", async () => {
    client = new PGlite();
    const files = (await readdir(resolve(process.cwd(), "drizzle")))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    for (const file of files.filter((name) => name < "0015")) await applyMigration(client, file);

    const userId = "11111111-1111-4111-8111-111111111111";
    const messageId = "22222222-2222-4222-8222-222222222222";
    await client.exec(`
      insert into users (id, phone_e164, onboarding_state, phone_verified_at)
      values ('${userId}', '+12025550199', 'complete', now());
      insert into conversation_messages (
        id, user_id, provider, provider_service, provider_message_sid,
        direction, kind, status, body, received_at
      ) values (
        '${messageId}', '${userId}', 'sendblue', 'iMessage', 'legacy-sendblue-message',
        'inbound', 'user', 'processed', 'Legacy history', now()
      );
      insert into conversation_states (user_id, last_processed_message_id)
      values ('${userId}', '${messageId}');
    `);

    for (const file of files.filter((name) => name >= "0015")) await applyMigration(client, file);

    const identities = await client.query<{ user_id: string; normalized_value: string }>(
      "select user_id, normalized_value from user_identities",
    );
    expect(identities.rows).toEqual([{ user_id: userId, normalized_value: "+12025550199" }]);
    const conversations = await client.query<{ id: string; owner_user_id: string }>(
      "select id, owner_user_id from conversations",
    );
    expect(conversations.rows).toHaveLength(1);
    expect(conversations.rows[0].owner_user_id).toBe(userId);
    const message = await client.query<{ conversation_id: string }>(
      `select conversation_id from conversation_messages where id = '${messageId}'`,
    );
    expect(message.rows[0].conversation_id).toBe(conversations.rows[0].id);
    const state = await client.query<{ conversation_id: string }>(
      `select conversation_id from conversation_states where user_id = '${userId}'`,
    );
    expect(state.rows[0].conversation_id).toBe(conversations.rows[0].id);
    const binding = await client.query<{ provider: string; external_message_id: string }>(
      "select provider, external_message_id from provider_message_bindings",
    );
    expect(binding.rows).toEqual([{ provider: "sendblue", external_message_id: "legacy-sendblue-message" }]);
  }, 15_000);
});

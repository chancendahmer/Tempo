/** Synthetic account for isolated local browser QA. Never connects to production. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { ensureDirectConversation } from "../../src/server/db/repositories/messaging-identity-repository";
import { previewWorkspace } from "../../src/app/workspace/workspace-data";
import { lifeItemSchema } from "../../src/server/domain/life-items";
import { WebSessionService } from "../../src/server/security/web-session";
import { issueActionToken } from "../../src/server/security/action-token";

const connectionString = "postgresql://postgres@127.0.0.1:55437/tempo_ui_release";
const baseUrl = process.argv[2] ?? "http://localhost:3101";
const mode = process.argv[3] ?? "populated";
if (!["populated", "empty", "outsider"].includes(mode)) throw new Error("Choose populated, empty or outsider");
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) throw new Error("Local browser origin required");
// Deliberately public test key, valid only for the disposable local candidate.
const fieldEncryptionKey = Buffer.alloc(32, 7).toString("base64");
const pool = new Pool({ connectionString, max: 2 });
const database = scopedDatabase(drizzle(pool, { schema }));

async function main() {
  const phone = mode === "empty" ? "+12025550198" : mode === "outsider" ? "+12025550197" : "+12025550199";
  const prior = await database.select().from(schema.users).where(eq(schema.users.phoneE164, phone));
  const now = new Date();
  const fixture = previewWorkspace(now);
  const user = prior[0] ?? (await database.insert(schema.users).values({
    phoneE164: phone, displayName: mode === "empty" ? "Local QA Empty" : mode === "outsider" ? "Local QA Outsider" : "Local QA Alex", timezone: "America/New_York",
    onboardingState: "complete", phoneVerifiedAt: now, profileCompletedAt: now,
    quietHoursStart: "22:00", quietHoursEnd: "08:00", proactiveOptIn: false,
    profileInstructions: "Synthetic local QA account. No real messages or external connections.",
  }).returning())[0];
  if (!prior.length && mode === "populated") {
    const ids = new Map<string, string>();
    const remap = (id: string) => { if (!ids.has(id)) ids.set(id, randomUUID()); return ids.get(id)!; };
    await database.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "synthetic-local-qa", termsVersion: "synthetic-local-qa", privacyVersion: "synthetic-local-qa" });
    await ensureDirectConversation(database, { userId: user.id, phoneE164: phone });
    await database.insert(schema.goals).values(fixture.goals.map(goal => ({ id: remap(goal.id), userId: user.id, title: goal.title, description: goal.description })));
    await database.insert(schema.tasks).values(fixture.tasks.map(task => ({
      id: remap(task.id), userId: user.id, title: task.title, goalId: task.goalId ? remap(task.goalId) : null,
      status: task.status === "completed" ? "completed" as const : "not_started" as const,
      estimatedMinutes: task.estimatedMinutes, dueAt: task.dueAt ? new Date(task.dueAt) : null,
      completedAt: task.status === "completed" ? now : null,
    })));
    await database.insert(schema.lifeItems).values(fixture.items.map(item => ({
      id: remap(item.id), userId: user.id,
      data: lifeItemSchema.parse(JSON.parse(JSON.stringify(item.data, (_key, value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? remap(value) : value))),
    })));
  }
  if (mode === "populated" && !(await database.select({ id: schema.memoryEntries.id }).from(schema.memoryEntries).where(eq(schema.memoryEntries.userId, user.id))).length) {
    await database.insert(schema.memoryEntries).values((fixture.memories ?? []).map(memory => ({ userId: user.id, content: memory.content, category: memory.category === "routine" ? "pattern" as const : "preference" as const })));
  }
  // Display fixtures only: no scheduled delivery action is created.
  if (mode === "populated" && !(await database.select({ id: schema.reminders.id }).from(schema.reminders).where(eq(schema.reminders.userId, user.id))).length) {
    await database.insert(schema.reminders).values(fixture.reminders.map(reminder => ({
      userId: user.id, text: reminder.text, remindAt: new Date(reminder.remindAt), timezone: user.timezone,
      status: "scheduled" as const, idempotencyKey: `local-display-fixture:${randomUUID()}`,
    })));
  }
  if (!prior.length && mode !== "populated") {
    await database.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "synthetic-local-qa", termsVersion: "synthetic-local-qa", privacyVersion: "synthetic-local-qa" });
    await ensureDirectConversation(database, { userId: user.id, phoneE164: phone });
  }
  if (mode === "outsider" && !(await database.select({ id: schema.lifeItems.id }).from(schema.lifeItems).where(eq(schema.lifeItems.userId, user.id))).length) {
    await database.insert(schema.lifeItems).values({ id: randomUUID(), userId: user.id, data: { kind: "note", title: "OUTSIDER_PRIVATE_MARKER", body: "Must never appear in another synthetic account." } });
  }
  const session = await new WebSessionService(database).create(user.id);
  const token = issueActionToken({ userId: user.id, scope: "account:signin", sessionId: session.id }, fieldEncryptionKey);
  const output = { syntheticOnly: true, mode, databaseUrl: connectionString, baseUrl, fieldEncryptionKey, userId: user.id,
    signInUrl: `${baseUrl}/api/auth/phone?token=${token}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    notes: "Normal local sign-in redemption. No carrier, model, Google credentials or delivery jobs. Regenerate by rerunning this script." };
  console.log(JSON.stringify(output, null, 2));
}
main().finally(() => pool.end()).catch(error => { console.error(error); process.exitCode = 1; });

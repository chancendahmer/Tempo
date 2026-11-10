/** Prints a normal link for an existing unrevoked pending signup; no database writes. */
import assert from "node:assert/strict";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { issueActionToken } from "../../src/server/security/action-token";

const phone = process.argv[2];
assert.match(phone ?? "", /^\+120255501\d{2}$/, "Only reserved synthetic local phone numbers allowed");
assert.ok(!["+12025550197", "+12025550198", "+12025550199"].includes(phone), "Use a fresh signup fixture, not a shared browser fixture");
const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 1 });
const database = drizzle(pool, { schema });
async function main() {
  const [row] = await database.select({ userId: schema.users.id, sessionId: schema.webSessions.id }).from(schema.webSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.webSessions.userId))
    .where(and(eq(schema.users.phoneE164, phone), isNull(schema.webSessions.activatedAt), isNull(schema.webSessions.revokedAt), gt(schema.webSessions.createdAt, new Date(Date.now() - 15 * 60_000))))
    .orderBy(desc(schema.webSessions.createdAt)).limit(1);
  assert.ok(row, "A recent unrevoked pending signup is required; submit the real form first");
  const token = issueActionToken({ ...row, scope: "account:signin" }, Buffer.alloc(32, 7).toString("base64"));
  // Keep bearer output in immediate browser use only; never redirect to an artifact.
  console.log(JSON.stringify({ syntheticOnly: true, signInUrl: `http://localhost:3101/api/auth/phone?token=${token}` }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());

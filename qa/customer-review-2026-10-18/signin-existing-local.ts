/** Only creates a normal pending session for the existing synthetic Alex fixture. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/server/db/schema";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { WebSessionService } from "../../src/server/security/web-session";
import { issueActionToken } from "../../src/server/security/action-token";

const pool = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:55437/tempo_ui_release", max: 1 });
const database = scopedDatabase(drizzle(pool, { schema }));
async function main() {
  const [user] = await database.select().from(schema.users).where(eq(schema.users.phoneE164, "+12025550199"));
  assert.ok(user, "Existing synthetic fixture required; this helper never seeds accounts");
  assert.equal(user.displayName, "Local QA Alex");
  assert.match(user.profileInstructions ?? "", /Synthetic local QA/);
  const session = await new WebSessionService(database).create(user.id);
  const token = issueActionToken({ userId: user.id, scope: "account:signin", sessionId: session.id }, Buffer.alloc(32, 7).toString("base64"));
  // Sensitive bearer output is for immediate browser use only. Never redirect to an artifact.
  console.log(JSON.stringify({ syntheticOnly: true, existingFixture: "Local QA Alex (0199)", signInUrl: `http://localhost:3101/api/auth/phone?token=${token}` }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());

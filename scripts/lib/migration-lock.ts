import type { Pool, PoolClient } from "pg";

/** Serialize web/worker migrations on the same dedicated database connection. */
export async function withMigrationLock(pool: Pool, run: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SET lock_timeout = '120s'");
    await client.query("SELECT pg_advisory_lock(724651102)");
    locked = true;
    await run(client);
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(724651102)");
    } finally {
      // This connection is only for migrations; discard its session settings.
      client.release(true);
    }
  }
}

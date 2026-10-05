import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { withMigrationLock } from "../../../scripts/lib/migration-lock";

it.each([false, true])("holds a session lock for migration and releases it after success/failure=%s", async fails => {
  const events: string[] = [];
  const client = { query: vi.fn(async (sql: string) => { events.push(sql); }), release: vi.fn() };
  const pool = { connect: async () => client } as unknown as Pool;
  const operation = withMigrationLock(pool, async connection => {
    expect(connection).toBe(client);
    events.push("migration");
    if (fails) throw Error("fixture failure");
  });
  if (fails) await expect(operation).rejects.toThrow("fixture failure");
  else await operation;
  expect(events).toEqual(["SET lock_timeout = '120s'", "SELECT pg_advisory_lock(724651102)", "migration", "SELECT pg_advisory_unlock(724651102)"]);
  expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
});

it("does not run a migration if acquiring the lock fails", async () => {
  const client = { query: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(Error("lock timeout")), release: vi.fn() };
  const run = vi.fn();
  await expect(withMigrationLock({ connect: async () => client } as unknown as Pool, run)).rejects.toThrow("lock timeout");
  expect(run).not.toHaveBeenCalled();
  expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
});

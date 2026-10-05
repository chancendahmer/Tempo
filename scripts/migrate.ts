import { drizzle } from "drizzle-orm/node-postgres";
import { withMigrationLock } from "./lib/migration-lock";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDatabase, getPool } from "../src/server/db/client";
import { migrationFailureSummary } from "./lib/migration-error";

async function main() {
  try {
    await withMigrationLock(getPool(), client => migrate(drizzle(client), { migrationsFolder: "drizzle" }));
    process.stdout.write("Tempo database migrations completed.\n");
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${migrationFailureSummary(error)}\n`);
  process.exitCode = 1;
});

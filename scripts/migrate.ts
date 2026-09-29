import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDatabase, getDatabase } from "../src/server/db/client";
import { migrationFailureSummary } from "./lib/migration-error";

async function main() {
  try {
    await migrate(getDatabase(), { migrationsFolder: "drizzle" });
    process.stdout.write("Tempo database migrations completed.\n");
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${migrationFailureSummary(error)}\n`);
  process.exitCode = 1;
});

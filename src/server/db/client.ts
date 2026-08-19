import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "../config/env";
import * as schema from "./schema";

let pool: Pool | undefined;
export type TempoDatabase = ReturnType<typeof drizzle<typeof schema>>;
let database: TempoDatabase | undefined;

export function getPool(): Pool {
  if (pool) return pool;

  const env = requireEnv(["DATABASE_URL"]);
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "tempo-web",
  });

  return pool;
}

export function getDatabase() {
  if (!database) {
    database = drizzle(getPool(), { schema });
  }
  return database;
}

export async function closeDatabase() {
  if (pool) await pool.end();
  pool = undefined;
  database = undefined;
}

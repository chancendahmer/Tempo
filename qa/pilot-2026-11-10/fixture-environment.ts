import { serverEnvSchema } from "../../src/server/config/env";

export const base = "http://localhost:3103";
export const databaseUrl = "postgresql://postgres@127.0.0.1:55437/tempo_ui_release";
export const key = Buffer.alloc(32, 7).toString("base64");

// Imported before repository modules, some of which initialize the logger.
for (const name of [...Object.keys(serverEnvSchema.shape), ...Object.keys(process.env).filter(name => /^PG/i.test(name))]) delete process.env[name];
Object.assign(process.env, { PGPASSFILE: "NUL", NODE_ENV: "test", APP_BASE_URL: base, DATABASE_URL: databaseUrl, FIELD_ENCRYPTION_KEY: key, LOG_LEVEL: "silent" });
globalThis.fetch = async () => { throw new Error("HTTP forbidden in account QA fixture"); };

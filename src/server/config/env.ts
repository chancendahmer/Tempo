import { z } from "zod";

const optionalSecret = z.string().trim().min(1).optional();
const optionalEncryptionKey = optionalSecret.refine(
  (value) => !value || (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, "base64").length === 32),
  "FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  INTERVENTION_SHADOW_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  AUTONOMOUS_SENDING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  HYBRID_AI_REVIEW_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DATABASE_URL: optionalSecret,
  FIELD_ENCRYPTION_KEY: optionalEncryptionKey,
  MESSAGING_PROVIDER: z.enum(["sendblue", "linq", "twilio"]).default("sendblue"),
  SENDBLUE_API_KEY: optionalSecret,
  SENDBLUE_API_SECRET: optionalSecret,
  SENDBLUE_WEBHOOK_SECRET: optionalSecret,
  SENDBLUE_PHONE_NUMBER: optionalSecret,
  SENDBLUE_API_BASE_URL: z.url().default("https://api.sendblue.com"),
  LINQ_API_KEY: optionalSecret,
  LINQ_WEBHOOK_SECRET: optionalSecret,
  LINQ_API_BASE_URL: z.url().default("https://api.linqapp.com/api/partner/v3"),
  TWILIO_ACCOUNT_SID: optionalSecret,
  TWILIO_AUTH_TOKEN: optionalSecret,
  TWILIO_API_KEY_SID: optionalSecret,
  TWILIO_API_KEY_SECRET: optionalSecret,
  TWILIO_MESSAGING_SERVICE_SID: optionalSecret,
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GOOGLE_REDIRECT_URI: z.url().optional(),
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: optionalSecret,
  WORKER_ID: z.string().trim().min(1).default("tempo-local-worker"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60_000).default(2_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ServerEnvKey = keyof ServerEnv;
type EnvSource = Record<string, string | undefined>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  if (source === process.env && cachedEnv) return cachedEnv;

  const parsed = serverEnvSchema.parse(source);
  if (source === process.env) cachedEnv = parsed;
  return parsed;
}

export function requireEnv(
  keys: readonly ServerEnvKey[],
  source: EnvSource = process.env,
): ServerEnv {
  const env = getServerEnv(source);
  const missing = keys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (env.NODE_ENV === "production") {
    const appUrl = new URL(env.APP_BASE_URL);
    if (appUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(appUrl.hostname)) {
      throw new Error("Production APP_BASE_URL must be a public HTTPS URL");
    }
    if (env.GOOGLE_REDIRECT_URI) {
      const redirectUrl = new URL(env.GOOGLE_REDIRECT_URI);
      if (redirectUrl.protocol !== "https:" || redirectUrl.origin !== appUrl.origin) {
        throw new Error("Production GOOGLE_REDIRECT_URI must use the APP_BASE_URL HTTPS origin");
      }
    }
  }

  return env;
}

export function resetEnvCacheForTests() {
  cachedEnv = undefined;
}

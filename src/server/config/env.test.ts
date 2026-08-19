import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv, requireEnv, resetEnvCacheForTests } from "./env";

describe("server environment", () => {
  afterEach(resetEnvCacheForTests);

  it("uses safe development defaults without provider credentials", () => {
    const env = getServerEnv({});

    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
    expect(env.INTERVENTION_SHADOW_MODE).toBe(true);
    expect(env.MESSAGING_PROVIDER).toBe("sendblue");
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("parses an explicit shadow-mode override", () => {
    const env = getServerEnv({ INTERVENTION_SHADOW_MODE: "false" });
    expect(env.INTERVENTION_SHADOW_MODE).toBe(false);
  });

  it("reports required keys together", () => {
    expect(() => requireEnv(["DATABASE_URL", "FIELD_ENCRYPTION_KEY"], {})).toThrow(
      "Missing required environment variables: DATABASE_URL, FIELD_ENCRYPTION_KEY",
    );
  });

  it("rejects invalid URLs", () => {
    expect(() => getServerEnv({ APP_BASE_URL: "not-a-url" })).toThrow();
  });

  it("rejects malformed encryption keys before startup reaches a provider flow", () => {
    expect(() => getServerEnv({ FIELD_ENCRYPTION_KEY: "too-short" })).toThrow(
      "FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  });

  it("requires public HTTPS origins in production", () => {
    expect(() => requireEnv([], { NODE_ENV: "production" })).toThrow(
      "Production APP_BASE_URL must be a public HTTPS URL",
    );
    expect(() => requireEnv([], {
      NODE_ENV: "production",
      APP_BASE_URL: "https://tempo.example",
      GOOGLE_REDIRECT_URI: "https://other.example/api/auth/google/callback",
    })).toThrow("Production GOOGLE_REDIRECT_URI must use the APP_BASE_URL HTTPS origin");
  });
});

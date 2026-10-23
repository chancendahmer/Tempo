import { expect, it, vi } from "vitest";
vi.mock("../../../server/config/env", () => ({ getServerEnv: () => ({ NODE_ENV: "test", TEMPO_BUILD_SHA: "abcdef1234567", INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, CLEANUP_CHECKINS_ENABLED: true, PROACTIVE_CANARY_USER_IDS: ["private-account"], SENDBLUE_API_KEY: "private-key" }) }));
import { GET } from "./route";

it("labels liveness switches as web configuration and exposes no credentials or canary identities", async () => {
  const response = GET();
  const body = await response.json();
  expect(body).toMatchObject({ ok: true, service: "tempo-web", configurationScope: "web", build: "abcdef1234567", shadowMode: true, autonomousSendingEnabled: false, cleanupCheckinsEnabled: true, canaryCount: 1 });
  expect(JSON.stringify(body)).not.toContain("private-");
  expect(body).not.toHaveProperty("worker");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

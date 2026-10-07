import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "./env";
import { cleanupDeliveryEnabled, proactiveDeliveryEnabled } from "./proactive-delivery";

const demo = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

describe("account-scoped proactive canary", () => {
  it("releases cleanup independently without enabling other automatic coaching", () => {
    const disabled = serverEnvSchema.parse({});
    expect(cleanupDeliveryEnabled(disabled, other)).toBe(false);
    const enabled = serverEnvSchema.parse({CLEANUP_CHECKINS_ENABLED: "true"});
    expect(cleanupDeliveryEnabled(enabled, other)).toBe(true);
    expect(proactiveDeliveryEnabled(enabled, other)).toBe(false);
  });
  it("defaults to shadow and rejects malformed or broad allowlists", () => {
    expect(serverEnvSchema.parse({}).PROACTIVE_CANARY_USER_IDS).toEqual([]);
    for (const value of ["*", "all", `${demo},`, "not-a-uuid"]) {
      expect(serverEnvSchema.safeParse({ PROACTIVE_CANARY_USER_IDS: value }).success).toBe(false);
    }
  });
  it("allows only the exact account while global delivery remains disabled", () => {
    const env = serverEnvSchema.parse({ PROACTIVE_CANARY_USER_IDS: ` ${demo}, ${demo} ` });
    expect(env.PROACTIVE_CANARY_USER_IDS).toEqual([demo]);
    expect(proactiveDeliveryEnabled(env, demo)).toBe(true);
    expect(proactiveDeliveryEnabled(env, other)).toBe(false);
    expect(proactiveDeliveryEnabled({ ...env, PROACTIVE_CANARY_USER_IDS: [] }, demo)).toBe(false);
  });
  it("preserves global rollout semantics", () => {
    expect(proactiveDeliveryEnabled({ INTERVENTION_SHADOW_MODE: false, AUTONOMOUS_SENDING_ENABLED: true }, other)).toBe(true);
    expect(proactiveDeliveryEnabled({ INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: true }, other)).toBe(false);
  });
});

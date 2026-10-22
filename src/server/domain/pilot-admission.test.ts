import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "../config/env";
import { isVerifiedExistingPilotAccount, pilotAdmissionAllowed } from "./pilot-admission";

describe("private pilot admission", () => {
  it("preserves open enrollment by default", () => {
    expect(pilotAdmissionAllowed(serverEnvSchema.parse({}), "+12025550198")).toBe(true);
  });
  it("normalizes formatted explicit international numbers and deduplicates", () => {
    const policy = serverEnvSchema.parse({ PILOT_ADMISSION_MODE: "invite_only", PILOT_INVITED_PHONES: "+1 (202) 555-0198, +12025550198" });
    expect(policy.PILOT_INVITED_PHONES).toEqual(["+12025550198"]);
    expect(pilotAdmissionAllowed(policy, "+12025550198")).toBe(true);
    expect(pilotAdmissionAllowed(policy, "+12025550197")).toBe(false);
  });
  it.each(["", "*", "all", "+12025550198,", "2025550198", "+12025550198 ext 2", "+1", Array(101).fill("+12025550198").join(",")])("fails closed for empty or malformed enabled invitation lists (%s)", value => {
    const policy = serverEnvSchema.parse({ PILOT_ADMISSION_MODE: "invite_only", PILOT_INVITED_PHONES: value });
    expect(pilotAdmissionAllowed(policy, "+12025550198")).toBe(false);
    expect(pilotAdmissionAllowed(policy, "+12025550198", true)).toBe(true);
  });
  it("closes malformed modes without breaking environment parsing for compliance", () => {
    const policy = serverEnvSchema.parse({ PILOT_ADMISSION_MODE: "invite-onyl", PILOT_INVITED_PHONES: "+12025550198" });
    expect(policy.PILOT_ADMISSION_MODE).toBeNull();
    expect(pilotAdmissionAllowed(policy, "+12025550198")).toBe(false);
    expect(pilotAdmissionAllowed(policy, "+12025550198", true)).toBe(true);
  });
  it("accepts 100 entries, but never treats an unverified signup or unconsented account as established", () => {
    expect(serverEnvSchema.parse({ PILOT_INVITED_PHONES: Array(100).fill("+12025550198").join(",") }).PILOT_INVITED_PHONES).toEqual(["+12025550198"]);
    expect(isVerifiedExistingPilotAccount(undefined)).toBe(false);
    expect(isVerifiedExistingPilotAccount({ phoneVerifiedAt: null, onboardingState: "introduction" })).toBe(false);
    expect(isVerifiedExistingPilotAccount({ phoneVerifiedAt: new Date(), onboardingState: "awaiting_consent" })).toBe(false);
    expect(isVerifiedExistingPilotAccount({ phoneVerifiedAt: new Date(), onboardingState: "introduction" })).toBe(true);
  });
});

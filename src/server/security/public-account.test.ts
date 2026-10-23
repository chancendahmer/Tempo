import { describe, expect, it } from "vitest";
import { accountCacheKey, publicAccount, sessionBindingKey, type WebAccount } from "./web-session";
import { createHash } from "node:crypto";

describe("public account cache ownership", () => {
  const account: WebAccount = { userId: "00000000-0000-4000-8000-000000000001", displayName: "A", phoneLast4: "1234", phoneVerified: true, onboardingState: "complete", profileInstructions: "Short steps", profileComplete: true, calendarStatus: "active" };
  it("uses stable opaque account identity rather than editable fields or phone suffixes", () => {
    const first = publicAccount(account);
    expect(first.cacheKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.cacheKey).toBe(accountCacheKey(account.userId));
    expect(publicAccount({ ...account, displayName: "Edited", profileInstructions: "New instructions" }).cacheKey).toBe(first.cacheKey);
    expect(publicAccount({ ...account, userId: "00000000-0000-4000-8000-000000000002" }).cacheKey).not.toBe(first.cacheKey);
    expect(JSON.stringify(first)).not.toContain(account.userId);
  });
  it("does not extend the unverified public account projection", () => {
    const pending = publicAccount({ ...account, phoneVerified: false });
    expect(pending).toEqual({ displayName: null, phoneLast4: "1234", phoneVerified: false, onboardingState: "pending_verification", profileInstructions: null, profileComplete: false, calendarStatus: null });
    expect(pending).not.toHaveProperty("cacheKey");
  });
  it("domain-separates session proofs from credentials, database token hashes and account identities", () => {
    const token = "synthetic-random-session-a";
    const proof = sessionBindingKey(token);
    expect(proof).toMatch(/^[a-f0-9]{64}$/); expect(proof).toBe(sessionBindingKey(token));
    expect(proof).not.toContain(token);
    expect(proof).not.toBe(createHash("sha256").update(token).digest("hex"));
    expect(proof).not.toBe(accountCacheKey(token));
    expect(proof).not.toBe(sessionBindingKey("synthetic-random-session-b"));
  });
});

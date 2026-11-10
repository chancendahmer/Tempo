import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), revoke: vi.fn(), log: vi.fn() }));
vi.mock("@/server/config/env", () => ({ getServerEnv: () => ({ APP_BASE_URL: "https://tempo.test" }) }));
vi.mock("@/server/observability/logger", () => ({ logger: { error: mocks.log } }));
vi.mock("@/server/security/web-session", () => ({
  WEB_SESSION_COOKIE: "tempo_session", sessionBindingKey: (token: string) => `session:${token}`, accountCacheKey: (id: string) => `cache:${id}`,
  WebSessionService: class { findAccount = mocks.account; revoke = mocks.revoke; },
  isTrustedMutationOrigin: (origin: string | null) => origin === "https://tempo.test",
  publicAccount: (account: { phoneVerified: boolean; userId: string }) => account.phoneVerified ? { phoneVerified: true, cacheKey: `cache:${account.userId}` } : { phoneVerified: false, onboardingState: "pending_verification" },
}));
import { POST } from "../../app/api/auth/logout/route";
import { GET } from "../../app/api/account/me/route";

const request = (token?: string, proof?: string, origin = "https://tempo.test") => new NextRequest("https://tempo.test/api/auth/logout", {
  method: "POST", headers: { origin, ...(token ? { cookie: `tempo_session=${token}` } : {}), ...(proof ? { "x-tempo-session": proof } : {}) },
});
beforeEach(() => { vi.resetAllMocks(); mocks.account.mockResolvedValue({ userId: "account-a", phoneVerified: true }); });

it.each([true, false])("publishes an opaque session-only logout proof for verified=%s without exposing a pending owner", async verified => {
  mocks.account.mockResolvedValue({ userId: "account-a", phoneVerified: verified });
  const response = await GET(new NextRequest("https://tempo.test/api/account/me", { headers: { cookie: "tempo_session=session-a" } }));
  const body = await response.json();
  expect(body.sessionKey).toBe("session:session-a"); expect(response.headers.get("cache-control")).toBe("private, no-store");
  if (!verified) { expect(body.account).not.toHaveProperty("cacheKey"); expect(JSON.stringify(body)).not.toContain("account-a"); }
});
it.each([true, false])("rejects stale A or absent proof on current B verified=%s before revocation/cookie clearing", async verified => {
  mocks.account.mockResolvedValue({ userId: "account-b", phoneVerified: verified });
  for (const proof of ["session:session-a", undefined]) {
    const response = await POST(request("session-b", proof));
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "session_changed" });
    expect(response.headers.get("set-cookie")).toBeNull(); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(mocks.revoke).not.toHaveBeenCalled();
});
it("preserves exact pending-session cleanup using the proof observed before suspend", async () => {
  mocks.account.mockResolvedValue({ userId: "pending-a", phoneVerified: false });
  const observed = await (await GET(new NextRequest("https://tempo.test/api/account/me", { headers: { cookie: "tempo_session=pending-session" } }))).json();
  const response = await POST(request("pending-session", observed.sessionKey));
  expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith("pending-session");
});
it("permits absent/expired-session idempotent cleanup and publishes no stale proof", async () => {
  const absent = await POST(request()); expect(absent.status).toBe(200);
  expect(mocks.account).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled();
  mocks.account.mockResolvedValue(null);
  const expired = await POST(request("expired-session")); expect(expired.status).toBe(200);
  expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith("expired-session");
  expect(await (await GET(new NextRequest("https://tempo.test/api/account/me"))).json()).toEqual({ account: null, sessionKey: null });
});
it("keeps origin denial and DB outages private without clearing a possibly current session", async () => {
  expect((await POST(request("session-a", "session:session-a", "https://other.test"))).status).toBe(403);
  expect(mocks.revoke).not.toHaveBeenCalled();
  const error = Object.assign(new Error("PRIVATE_SQL"), { params: ["PRIVATE_HASH"] });
  mocks.account.mockRejectedValueOnce(error);
  const lookupFailed = await POST(request("session-b", "session:session-a"));
  expect(lookupFailed.status).toBe(503); expect(lookupFailed.headers.get("set-cookie")).toBeNull();
  expect(mocks.revoke).not.toHaveBeenCalled();
  mocks.revoke.mockRejectedValueOnce(error);
  const revokeFailed = await POST(request("session-a", "session:session-a"));
  expect(revokeFailed.status).toBe(503); expect(revokeFailed.headers.get("set-cookie")).toBeNull();
  expect(`${await lookupFailed.text()} ${await revokeFailed.text()} ${JSON.stringify(mocks.log.mock.calls)}`).not.toContain("PRIVATE_");
  expect(mocks.log.mock.calls.every(([metadata]) => Object.keys(metadata).join() === "operation")).toBe(true);
});

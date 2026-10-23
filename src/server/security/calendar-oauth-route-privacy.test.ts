import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { InvalidActionTokenError } from "./action-token";

const mocks = vi.hoisted(() => ({ env: vi.fn(), verify: vi.fn(), begin: vi.fn(), complete: vi.fn(), create: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock("@/server/config/env", () => ({ requireEnv: mocks.env }));
vi.mock("@/server/security/action-token", async () => ({ ...await import("./action-token"), verifyActionToken: mocks.verify }));
vi.mock("@/server/security/web-session", () => ({ WEB_SESSION_COOKIE: "tempo_session", WEB_SESSION_TTL_SECONDS: 3600, WebSessionService: class { create = mocks.create; } }));
vi.mock("@/server/adapters/calendar/google-calendar-provider", () => ({ GoogleCalendarProvider: class {} }));
vi.mock("@/server/db/repositories/calendar-oauth-repository", () => ({ DrizzleCalendarOAuthRepository: class {} }));
vi.mock("@/server/domain/calendar-oauth", () => ({ beginCalendarOAuth: mocks.begin, completeCalendarOAuth: mocks.complete }));
vi.mock("@/server/observability/logger", () => ({ logger: { error: mocks.error, warn: mocks.warn } }));
import { GET as start } from "../../app/api/auth/google/start/route";
import { GET as callback } from "../../app/api/auth/google/callback/route";

const unexpected = () => Object.assign(new Error("SYNTHETIC_PRIVATE_SQL"), { query: "SYNTHETIC_QUERY", params: ["SYNTHETIC_BOUND_SECRET"], config: { data: "SYNTHETIC_OAUTH_BODY" } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.verify.mockReturnValue({ userId: "token-owner-a" });
  mocks.env.mockReturnValue({ APP_BASE_URL: "https://tempo.test", FIELD_ENCRYPTION_KEY: "synthetic-key", NODE_ENV: "production" });
  mocks.begin.mockResolvedValue("https://accounts.example/authorize"); mocks.complete.mockResolvedValue({ userId: "token-owner-a" });
  mocks.create.mockResolvedValue({ token: "synthetic-new-session", expiresAt: new Date("2026-10-23T12:00:00Z") });
});

it("contains callback configuration failure without logging raw diagnostics or using an unvalidated redirect URL", async () => {
  mocks.env.mockImplementationOnce(() => { throw unexpected(); });
  const response = await callback(new NextRequest("https://tempo.test/api/auth/google/callback?state=synthetic-state&code=synthetic-code"));
  expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("location")).toBeNull(); expect(response.headers.get("set-cookie")).toBeNull();
  expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ operation: "complete_calendar_oauth" }, "calendar OAuth callback failed");
  expect(`${await response.text()} ${JSON.stringify(mocks.warn.mock.calls)}`).not.toContain("SYNTHETIC_");
});

it("sanitizes start failures without changing invalid-token or success redirects", async () => {
  mocks.begin.mockRejectedValueOnce(unexpected());
  const failed = await start(new NextRequest("https://tempo.test/api/auth/google/start?token=synthetic-action"));
  expect(failed.status).toBe(503);
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith({ operation: "start_calendar_oauth" }, "calendar OAuth start failed");
  expect(`${await failed.text()} ${JSON.stringify(mocks.error.mock.calls)}`).not.toContain("SYNTHETIC_");
  mocks.verify.mockImplementationOnce(() => { throw new InvalidActionTokenError(); });
  expect((await start(new NextRequest("https://tempo.test/api/auth/google/start?token=invalid"))).status).toBe(401);
  const success = await start(new NextRequest("https://tempo.test/api/auth/google/start?token=synthetic-action"));
  expect(success.status).toBe(303); expect(success.headers.get("location")).toBe("https://accounts.example/authorize");
  expect(mocks.verify).toHaveBeenCalledWith("synthetic-action", "calendar:connect", "synthetic-key");
  expect(mocks.begin.mock.calls.at(-1)?.[0].userId).toBe("token-owner-a");
});

it.each(["complete", "create"] as const)("sanitizes callback %s failure and never sets an unconfirmed session", async failure => {
  mocks[failure].mockRejectedValueOnce(unexpected());
  const response = await callback(new NextRequest("https://tempo.test/api/auth/google/callback?state=synthetic-state&code=synthetic-code"));
  expect(response.status).toBe(303); expect(response.headers.get("location")).toBe("https://tempo.test/extensions?calendar=failed");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ operation: "complete_calendar_oauth" }, "calendar OAuth callback failed");
  expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("SYNTHETIC_");
});

it("preserves cancellation and state-owner callback success rather than using a different browser cookie owner", async () => {
  const cancelled = await callback(new NextRequest("https://tempo.test/api/auth/google/callback?error=access_denied"));
  expect(cancelled.headers.get("location")).toBe("https://tempo.test/extensions?calendar=cancelled");
  expect(mocks.complete).not.toHaveBeenCalled();
  const success = await callback(new NextRequest("https://tempo.test/api/auth/google/callback?state=synthetic-state&code=synthetic-code", { headers: { cookie: "tempo_session=account-b" } }));
  expect(success.headers.get("location")).toBe("https://tempo.test/extensions?calendar=connected");
  expect(mocks.create).toHaveBeenCalledWith("token-owner-a", expect.any(Date), true);
  expect(success.headers.get("set-cookie")).toContain("HttpOnly"); expect(mocks.warn).not.toHaveBeenCalled();
});

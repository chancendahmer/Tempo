import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), agenda: vi.fn(), limit: vi.fn() }));
vi.mock("@/server/security/web-session", () => ({ WEB_SESSION_COOKIE: "tempo_session", accountCacheKey: (id: string) => `cache:${id}`, WebSessionService: class { findAccount = mocks.account; } }));
vi.mock("@/server/adapters/calendar/calendar-assistant", () => ({ CalendarAssistantIntegrations: class { agenda = mocks.agenda; } }));
vi.mock("@/server/adapters/calendar/calendar-provider", () => ({ CalendarAuthorizationError: class extends Error {} }));
vi.mock("@/server/db/repositories/operational-repository", () => ({ OperationalRepository: class { consumeRateLimit = mocks.limit; } }));
import { GET } from "./route";

const request = (owner?: string) => new NextRequest("https://tempo.test/api/account/calendar/events?start=2026-10-22T00:00:00Z&end=2026-10-23T00:00:00Z", { headers: { cookie: "tempo_session=current-session", ...(owner ? { "x-tempo-account": owner } : {}) } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.account.mockResolvedValue({ userId: "a", phoneVerified: true });
  mocks.limit.mockResolvedValue({ allowed: true }); mocks.agenda.mockResolvedValue(JSON.stringify({ events: [] }));
});
it("uses and echoes the verified owner for a normal calendar read", async () => {
  const response = await GET(request("cache:a")); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ cacheKey: "cache:a", events: [] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.agenda).toHaveBeenCalledExactlyOnceWith("a", "2026-10-22T00:00:00Z", "2026-10-23T00:00:00Z");
});
it("denies a missing or stale owner after cookie switch before any limiter or provider operation", async () => {
  mocks.account.mockResolvedValue({ userId: "b", phoneVerified: true });
  for (const expected of [undefined, "cache:a"]) {
    const response = await GET(request(expected)); expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "account_changed" });
  }
  expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.agenda).not.toHaveBeenCalled();
});
it("retains auth, rate, provider-reauthorization and private-unavailable statuses", async () => {
  mocks.account.mockResolvedValueOnce(null); expect((await GET(request())).status).toBe(401);
  mocks.limit.mockResolvedValueOnce({ allowed: false }); expect((await GET(request("cache:a"))).status).toBe(429);
  expect(mocks.agenda).not.toHaveBeenCalled();
  // Use the route's mocked error class so no SDK is loaded or invoked.
  const { CalendarAuthorizationError: RouteAuthorizationError } = await import("@/server/adapters/calendar/calendar-provider");
  mocks.agenda.mockRejectedValueOnce(new RouteAuthorizationError());
  expect((await (await GET(request("cache:a"))).json()).code).toBe("calendar_reauth_required");
  mocks.agenda.mockRejectedValueOnce(Object.assign(new Error("PRIVATE_SQL"), { params: ["PRIVATE_SECRET"] }));
  const failed = await GET(request("cache:a")); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("PRIVATE_");
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findAccount: vi.fn(), read: vi.fn(), save: vi.fn(), limit: vi.fn() }));
vi.mock("@/server/config/env", () => ({ getServerEnv: () => ({ APP_BASE_URL: "https://tempo.test" }) }));
vi.mock("@/server/domain/gentle-setup", async () => await import("../../../../server/domain/gentle-setup"));
vi.mock("@/server/security/web-session", () => ({ WEB_SESSION_COOKIE: "tempo_session", WebSessionService: class { findAccount = mocks.findAccount; }, isTrustedMutationOrigin: (origin: string | null) => origin === "https://tempo.test" }));
vi.mock("@/server/db/repositories/gentle-setup-repository", () => ({ readGentleSetup: mocks.read, saveGentleSetup: mocks.save, SetupAccountUnavailable: class extends Error {} }));
vi.mock("@/server/db/repositories/operational-repository", () => ({ OperationalRepository: class { consumeRateLimit = mocks.limit; } }));
vi.mock("@/server/observability/logger", () => ({ logger: { error: vi.fn() } }));
import { GET, POST } from "./route";

describe("workspace setup account boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAccount.mockResolvedValue({ userId: "session-owner", phoneVerified: true });
    mocks.read.mockResolvedValue({ setupStatus: "new", showStreak: true });
    mocks.save.mockResolvedValue({ setupStatus: "skipped", showStreak: true });
    mocks.limit.mockResolvedValue({ allowed: true });
  });
  const request = (body: unknown = { action: "skip" }, origin = "https://tempo.test") => new NextRequest("https://tempo.test/api/account/setup", { method: "POST", headers: { origin, "content-type": "application/json", cookie: "tempo_session=test-session" }, body: JSON.stringify(body) });

  it("blocks foreign origins and unverified sessions before persistence", async () => {
    expect((await POST(request(undefined, "https://other.test"))).status).toBe(403);
    expect(mocks.findAccount).not.toHaveBeenCalled();
    mocks.findAccount.mockResolvedValue({ userId: "session-owner", phoneVerified: false });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses session ownership and rejects extra authority-bearing fields", async () => {
    expect((await POST(request({ action: "save", userId: "other", proactiveOptIn: true }))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("session-owner", { action: "skip" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns account settings privately and respects write rate limits", async () => {
    const response = await GET(new NextRequest("https://tempo.test/api/account/setup", { headers: { cookie: "tempo_session=test-session" } }));
    expect(await response.json()).toEqual({ setup: { setupStatus: "new", showStreak: true } });
    expect(mocks.read).toHaveBeenCalledWith("session-owner");
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 22 });
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("22");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects oversized requests without passing unchecked input to persistence", async () => {
    expect((await POST(request({ action: "save", displayName: "a".repeat(2100) }))).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

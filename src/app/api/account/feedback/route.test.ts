import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackConflict, FeedbackRateLimited } from "../../../../server/domain/pilot-feedback";

const mocks = vi.hoisted(() => ({ account: vi.fn(), submit: vi.fn(), log: vi.fn() }));
vi.mock("../../../../server/config/env", () => ({ requireEnv: () => ({ APP_BASE_URL: "https://tempo.test", FIELD_ENCRYPTION_KEY: "synthetic" }) }));
vi.mock("../../../../server/security/web-session", () => ({ accountCacheKey: (userId: string) => `cache:${userId}`, WEB_SESSION_COOKIE: "tempo_session", WebSessionService: class { findAccount = mocks.account; }, isTrustedMutationOrigin: (origin: string | null) => origin === "https://tempo.test" }));
vi.mock("../../../../server/db/repositories/pilot-feedback-repository", () => ({ PilotFeedbackRepository: class { submit = mocks.submit; } }));
vi.mock("../../../../server/observability/logger", () => ({ logger: { error: mocks.log } }));
import { POST } from "./route";

const body = () => ({ requestId: randomUUID(), type: "problem", section: "tasks", impact: "slowed", followUpConsent: false });
const request = (input: unknown = body(), origin = "https://tempo.test") => new NextRequest("https://tempo.test/api/account/feedback", { method: "POST", headers: { "x-tempo-account": "cache:session-owner", origin, "content-type": "application/json", cookie: "tempo_session=synthetic" }, body: JSON.stringify(input) });
describe("feedback verified account HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account.mockResolvedValue({ userId: "session-owner", phoneVerified: true });
    mocks.submit.mockResolvedValue({ id: randomUUID(), createdAt: new Date().toISOString() });
  });
  it("blocks foreign origins, absent sessions and unverified accounts before persistence", async () => {
    expect((await POST(request(undefined, "https://foreign.test"))).status).toBe(403);
    expect(mocks.account).not.toHaveBeenCalled();
    for (const account of [null, { userId: "pending", phoneVerified: false }]) {
      mocks.account.mockResolvedValue(account);
      expect((await POST(request())).status).toBe(401);
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("derives ownership from the session and returns only a private receipt", async () => {
    const input = body();
    const response = await POST(request(input));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.submit).toHaveBeenCalledWith("session-owner", { ...input, detail: null }, "synthetic");
    expect(Object.keys(await response.json())).toEqual(["receipt", "cacheKey"]);
    expect((await POST(request({ ...body(), userId: "neighbor" }))).status).toBe(400);
  });
  it("rejects oversized and undeclared private attachments", async () => {
    expect((await POST(request({ ...body(), detail: "x".repeat(5000) }))).status).toBe(413);
    expect((await POST(request({ ...body(), detail: "x".repeat(1001) }))).status).toBe(400);
    expect((await POST(request({ ...body(), transcript: "private text" }))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("reports caps and conflicts without leaking details in unexpected error logs", async () => {
    mocks.submit.mockRejectedValueOnce(new FeedbackRateLimited(99));
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("99");
    mocks.submit.mockRejectedValueOnce(new FeedbackConflict("Use a new report for changed details."));
    expect((await POST(request())).status).toBe(409);
    mocks.submit.mockRejectedValueOnce(new Error("Sensitive SQL parameter with private text"));
    expect((await POST(request({ ...body(), detail: "private text" }))).status).toBe(503);
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("private text");
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("Sensitive SQL");
  });
});


it("rejects a stale or missing expected account before any persistence", async () => {
    mocks.account.mockResolvedValue({ userId: "session-owner", phoneVerified: true });
    mocks.submit.mockClear();
    for (const owner of [null, "cache:previous-account"]) {
      const req = new NextRequest("https://tempo.test/api/account/feedback", { method: "POST", headers: { origin: "https://tempo.test", cookie: "tempo_session=synthetic", ...(owner ? { "x-tempo-account": owner } : {}) }, body: JSON.stringify({ action: "skip" }) });
      const response = await POST(req);
      expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "account_changed" });
    }
    expect(mocks.submit).not.toHaveBeenCalled();
});

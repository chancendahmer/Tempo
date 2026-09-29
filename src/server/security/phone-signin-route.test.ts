import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueActionToken, InvalidActionTokenError } from "./action-token";

const mocks = vi.hoisted(() => ({ redeem: vi.fn(), env: { FIELD_ENCRYPTION_KEY: "", DATABASE_URL: "test", APP_BASE_URL: "https://tempo.test", NODE_ENV: "production" } }));
vi.mock("../config/env", () => ({ requireEnv: () => mocks.env }));
vi.mock("./web-session", () => ({
  WEB_SESSION_COOKIE: "tempo_session", WEB_SESSION_TTL_SECONDS: 2592000,
  WebSessionService: class { redeemSignIn = mocks.redeem; },
}));
import { GET, POST } from "../../app/api/auth/phone/route";

describe("phone sign-in link HTTP boundary", () => {
  beforeEach(() => { mocks.redeem.mockReset(); mocks.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
  function token() {
    return issueActionToken({ userId: randomUUID(), scope: "account:signin", sessionId: randomUUID() }, mocks.env.FIELD_ENCRYPTION_KEY);
  }
  function post(value: string, origin = "https://tempo.test") {
    return new NextRequest("https://tempo.test/api/auth/phone", {
      method: "POST", headers: { origin }, body: new URLSearchParams({ token: value }),
    });
  }
  it("does not consume a link or set a cookie when a preview fetches it", async () => {
    const result = await GET(new NextRequest(`https://tempo.test/api/auth/phone?token=${token()}`));
    expect(result.status).toBe(200);
    expect(await result.text()).toContain("Open my dashboard");
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.redeem).not.toHaveBeenCalled();
  });
  it("sets a secure phone session and redirects to the dashboard on confirmation", async () => {
    mocks.redeem.mockResolvedValue({ token: "new-session", expiresAt: new Date(Date.now() + 3600000) });
    const value = token();
    const result = await POST(post(value));
    expect(mocks.redeem).toHaveBeenCalledWith(value, mocks.env.FIELD_ENCRYPTION_KEY);
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("https://tempo.test/workspace");
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");
    expect(result.headers.get("set-cookie")).toContain("Secure");
  });
  it("rejects cross-origin confirmation and already-used links without a session", async () => {
    expect((await POST(post(token(), "https://other.test"))).status).toBe(400);
    expect(mocks.redeem).not.toHaveBeenCalled();
    mocks.redeem.mockRejectedValue(new InvalidActionTokenError());
    const result = await POST(post(token()));
    expect(result.status).toBe(400);
    expect(result.headers.get("set-cookie")).toBeNull();
  });
});

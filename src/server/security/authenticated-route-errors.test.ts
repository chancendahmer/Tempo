import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), profile: vi.fn(), redeem: vi.fn(), revoke: vi.fn(), env: vi.fn(), log: vi.fn(),
  workspace: vi.fn(), mutate: vi.fn(), board: vi.fn(), setup: vi.fn(), saveSetup: vi.fn(), limit: vi.fn(),
}));
vi.mock("../config/env", () => ({ getServerEnv: mocks.env, requireEnv: mocks.env }));
vi.mock("../observability/logger", () => ({ logger: { error: mocks.log } }));
vi.mock("./web-session", () => ({
  WEB_SESSION_COOKIE: "tempo_session", WEB_SESSION_TTL_SECONDS: 2592000,
  WebSessionService: class { findAccount = mocks.account; updateProfile = mocks.profile; redeemSignIn = mocks.redeem; revoke = mocks.revoke; },
  isTrustedMutationOrigin: (origin: string | null) => origin === "https://tempo.test",
  publicAccount: (account: unknown) => account,
  sessionBindingKey: (token: string) => `session:${token}`,
  accountCacheKey: (userId: string) => `cache:${userId}`,
}));
vi.mock("../db/repositories/workspace-repository", () => ({
  readWorkspace: mocks.workspace, mutateWorkspace: mocks.mutate, WorkspaceConflict: class extends Error {},
  // Mutation validation has repository coverage; this suite targets route error containment.
  workspaceActionSchema: z.object({ action: z.literal("checkins"), enabled: z.boolean() }).strict(),
}));
vi.mock("../db/repositories/board-repository", () => ({ readBoard: mocks.board }));
vi.mock("../db/repositories/gentle-setup-repository", () => ({ readGentleSetup: mocks.setup, saveGentleSetup: mocks.saveSetup, SetupAccountUnavailable: class extends Error {} }));
vi.mock("../db/repositories/operational-repository", () => ({ OperationalRepository: class { consumeRateLimit = mocks.limit; } }));
vi.mock("@/server/config/env", async () => await import("../config/env"));
vi.mock("@/server/observability/logger", async () => await import("../observability/logger"));
vi.mock("@/server/security/web-session", async () => await import("./web-session"));
vi.mock("@/server/db/repositories/workspace-repository", async () => await import("../db/repositories/workspace-repository"));
vi.mock("@/server/db/repositories/board-repository", async () => await import("../db/repositories/board-repository"));
vi.mock("@/server/db/repositories/gentle-setup-repository", async () => await import("../db/repositories/gentle-setup-repository"));
vi.mock("@/server/db/repositories/operational-repository", async () => await import("../db/repositories/operational-repository"));
vi.mock("@/server/security/action-links", async () => await import("./action-links"));
vi.mock("@/server/domain/gentle-setup", async () => await import("../domain/gentle-setup"));

import * as workspace from "../../app/api/account/workspace/route";
import * as me from "../../app/api/account/me/route";
import * as board from "../../app/api/account/board/route";
import * as setup from "../../app/api/account/setup/route";
import * as extensions from "../../app/api/account/extensions/route";
import * as phone from "../../app/api/auth/phone/route";
import * as logout from "../../app/api/auth/logout/route";
import { WorkspaceConflict } from "../db/repositories/workspace-repository";

const privateError = () => Object.assign(new Error("Failed query: select private_account from web_sessions where token_hash=private-hash"), {
  query: "select private_account, profile_instructions from users", params: ["private-hash", "+12025550199", "private-user-note"],
  cause: Object.assign(new Error("private-database-address connection refused"), { code: "ECONNREFUSED", detail: "private-user-note" }),
});
const request = (path: string, method = "GET", body?: unknown, origin = "https://tempo.test") => new NextRequest(`https://tempo.test${path}`, {
  method, headers: { "x-tempo-session": "session:private-cookie", "x-tempo-account": "cache:route-owner", origin, cookie: "tempo_session=private-cookie", "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const form = () => new NextRequest("https://tempo.test/api/auth/phone", { method: "POST", headers: { origin: "https://tempo.test" }, body: new URLSearchParams({ token: "private-action-token" }) });

describe("authenticated route outage privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.mockReturnValue({ APP_BASE_URL: "https://tempo.test", FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), NODE_ENV: "production" });
    mocks.account.mockResolvedValue({ userId: "route-owner", phoneVerified: true, displayName: "private-account-name", calendarStatus: "disconnected" });
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.workspace.mockResolvedValue({ profile: {} });
  });
  it.each([
    { name: "workspace session read", fail: "account", run: () => workspace.GET(request("/api/account/workspace")) },
    { name: "workspace record read", fail: "workspace", run: () => workspace.GET(request("/api/account/workspace")) },
    { name: "workspace mutation", fail: "mutate", run: () => workspace.POST(request("/api/account/workspace", "POST", { action: "checkins", enabled: false })) },
    { name: "workspace limiter", fail: "limit", run: () => workspace.POST(request("/api/account/workspace", "POST", { action: "checkins", enabled: false })) },
    { name: "account status", fail: "account", run: () => me.GET(request("/api/account/me")) },
    { name: "board session", fail: "account", run: () => board.GET(request("/api/account/board")) },
    { name: "board read", fail: "board", run: () => board.GET(request("/api/account/board")) },
    { name: "setup session", fail: "account", run: () => setup.GET(request("/api/account/setup")) },
    { name: "setup read", fail: "setup", run: () => setup.GET(request("/api/account/setup")) },
    { name: "setup write", fail: "saveSetup", run: () => setup.POST(request("/api/account/setup", "POST", { action: "skip" })) },
    { name: "extension session", fail: "account", run: () => extensions.GET(request("/api/account/extensions")) },
    { name: "sign-in redemption", fail: "redeem", run: () => phone.POST(form()) },
    { name: "logout revocation", fail: "revoke", run: () => logout.POST(request("/api/auth/logout", "POST")) },
  ] as const)("contains $name failures with private recovery and operation-only logging", async scenario => {
    mocks[scenario.fail].mockRejectedValue(privateError());
    const response = await scenario.run();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.log.mock.calls[0][0])).toEqual(["operation"]);
    const output = `${await response.text()} ${JSON.stringify(mocks.log.mock.calls)}`;
    expect(output).not.toMatch(/private-|token_hash|profile_instructions|select |12025550199|ECONNREFUSED/);
  });
  it("contains a current-owner profile update failure without logging its content", async () => {
    const owner = randomUUID(); mocks.account.mockResolvedValue({ userId: owner, phoneVerified: true });
    mocks.profile.mockRejectedValue(privateError());
    const response = await me.PUT(request("/api/account/me", "PUT", { displayName: "private-account-name", profileInstructions: "private-user-note", expectedCacheKey: `cache:${owner}` }));
    expect(response.status).toBe(503);
    expect(mocks.log).toHaveBeenCalledExactlyOnceWith({ operation: "update_web_profile" }, "profile update failed");
    expect(`${await response.text()} ${JSON.stringify(mocks.log.mock.calls)}`).not.toMatch(/private-|token_hash|select /);
  });
  it("rejects a missing or different profile owner before any mutation", async () => {
    const owner = randomUUID(); mocks.account.mockResolvedValue({ userId: owner, phoneVerified: true });
    for (const expectedCacheKey of [undefined, "cache:other-account"]) {
      const response = await me.PUT(request("/api/account/me", "PUT", { displayName: "Another account's old draft", expectedCacheKey }));
      expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: expect.stringContaining("Your changes were not saved") });
    }
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
    const response = await me.PUT(request("/api/account/me", "PUT", { displayName: "Current owner", expectedCacheKey: `cache:${owner}` }));
    expect(response.status).toBe(200); expect(mocks.profile).toHaveBeenCalledExactlyOnceWith(owner, { displayName: "Current owner", profileInstructions: null });
  });
  it.each(["preview", "redemption"])("contains %s configuration failures instead of throwing them to Next", async operation => {
    mocks.env.mockImplementation(() => { throw privateError(); });
    const response = operation === "preview" ? await phone.GET(request("/api/auth/phone?token=private-action-token")) : await phone.POST(form());
    expect(response.status).toBe(503);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(`${await response.text()} ${JSON.stringify(mocks.log.mock.calls)}`).not.toMatch(/private-|select |token_hash/);
  });
  it("preserves missing-session, invalid-origin, input/conflict and rate-limit responses", async () => {
    const noSession = new NextRequest("https://tempo.test/api/account/workspace");
    expect((await workspace.GET(noSession)).status).toBe(401);
    expect((await workspace.POST(request("/api/account/workspace", "POST", {}, "https://foreign.test"))).status).toBe(403);
    expect((await workspace.GET(request("/api/account/workspace?date=invalid"))).status).toBe(400);
    mocks.mutate.mockRejectedValue(new WorkspaceConflict("Refresh before editing."));
    expect((await workspace.POST(request("/api/account/workspace", "POST", { action: "checkins", enabled: false }))).status).toBe(409);
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 23 });
    const limited = await workspace.POST(request("/api/account/workspace", "POST", { action: "checkins", enabled: false }));
    expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("23");
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("keeps normal connection reads and confirmed logout responses private", async () => {
    const owner = randomUUID();
    mocks.account.mockResolvedValue({ userId: owner, phoneVerified: true, calendarStatus: "disconnected" });
    const connected = await extensions.GET(request("/api/account/extensions"));
    expect(connected.status).toBe(200);
    const links = await connected.json();
    expect(links.cacheKey).toBe(`cache:${owner}`);
    expect(links.calendar.status).toBe("disconnected");
    expect(new URL(links.calendar.connectUrl).pathname).toBe("/api/auth/google/start");
    expect(links.calendar.disconnectUrl).toBeNull();
    mocks.board.mockResolvedValue({ timezone: "UTC", tasks: [] });
    const ownedBoard = await board.GET(request("/api/account/board?userId=other"));
    expect(await ownedBoard.json()).toEqual({ timezone: "UTC", tasks: [], cacheKey: `cache:${owner}` });
    expect(mocks.board).toHaveBeenCalledExactlyOnceWith(owner);
    expect((await logout.POST(request("/api/auth/logout", "POST", undefined, "https://foreign.test"))).status).toBe(403);
    expect(mocks.revoke).not.toHaveBeenCalled();
    const signedOut = await logout.POST(request("/api/auth/logout", "POST"));
    expect(signedOut.status).toBe(200);
    expect(await signedOut.json()).toEqual({ loggedOut: true });
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    for (const response of [connected, signedOut]) expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.log).not.toHaveBeenCalled();
    mocks.account.mockResolvedValue(null);
    expect((await extensions.GET(request("/api/account/extensions"))).status).toBe(401);
    const anonymous = await me.GET(request("/api/account/me"));
    expect(anonymous.status).toBe(200); expect(await anonymous.json()).toEqual({ account: null, sessionKey: null });
  });
});

import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ account: vi.fn(), read: vi.fn(), mutate: vi.fn(), limit: vi.fn() }));
vi.mock("@/server/config/env", () => ({ getServerEnv: () => ({ APP_BASE_URL: "https://tempo.test" }) }));
vi.mock("@/server/security/web-session", () => ({
  WEB_SESSION_COOKIE: "tempo_session", accountCacheKey: (id: string) => `cache:${id}`,
  WebSessionService: class { findAccount = mocks.account; },
  isTrustedMutationOrigin: (origin: string | null) => origin === "https://tempo.test",
}));
vi.mock("@/server/db/repositories/workspace-repository", () => ({
  readWorkspace: mocks.read, mutateWorkspace: mocks.mutate, WorkspaceConflict: class extends Error {},
  // Domain payload validation has repository tests; these cases exercise the HTTP owner boundary.
  workspaceActionSchema: z.object({ action: z.enum(["save", "task", "chat", "checkins"]) }).passthrough(),
}));
vi.mock("@/server/db/repositories/operational-repository", () => ({ OperationalRepository: class { consumeRateLimit = mocks.limit; } }));
vi.mock("@/server/observability/logger", () => ({ logger: { error: vi.fn() } }));
import { GET, POST } from "./route";

const drafts: Record<string, object> = {
  save: { action: "save", id: "00000000-0000-4000-8000-000000000001", version: 0, data: { kind: "note", title: "Account A draft", body: "Private note" } },
  task: { action: "task", requestId: "00000000-0000-4000-8000-000000000002", command: { type: "create_task", title: "Account A task" } },
  chat: { action: "chat", requestId: "00000000-0000-4000-8000-000000000003", text: "Account A draft" },
  checkins: { action: "checkins", enabled: false },
};
const request = (method: string, owner?: string, action = "save", origin = "https://tempo.test") => new NextRequest("https://tempo.test/api/account/workspace", {
  method, headers: { origin, cookie: "tempo_session=current-cookie", ...(owner ? { "x-tempo-account": owner } : {}) },
  ...(method === "POST" ? { body: JSON.stringify(drafts[action]) } : {}),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue({ userId: "a", phoneVerified: true, phoneLast4: "1234" });
  mocks.read.mockResolvedValue({ profile: {}, messages: [] });
  mocks.limit.mockResolvedValue({ allowed: true }); mocks.mutate.mockResolvedValue({ message: "Saved" });
});

it("echoes only the verified session owner on reads and successful writes", async () => {
  const read = await GET(request("GET")); expect((await read.json()).cacheKey).toBe("cache:a");
  const saved = await POST(request("POST", "cache:a"));
  expect(saved.status).toBe(200); expect((await saved.json()).cacheKey).toBe("cache:a");
  expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith("a", drafts.save);
});

it.each(["save", "task", "chat", "checkins"])("rejects a pending %s draft after the browser cookie changes accounts", async action => {
  const observed = (await (await GET(request("GET"))).json()).cacheKey;
  mocks.account.mockResolvedValue({ userId: "b", phoneVerified: true });
  for (const expected of [observed, undefined]) {
    const response = await POST(request("POST", expected, action));
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "account_changed" });
  }
  expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled();
  expect((await (await GET(request("GET"))).json()).cacheKey).toBe("cache:b");
  expect((await POST(request("POST", "cache:b", action))).status).toBe(200);
  expect(mocks.mutate.mock.calls[0][0]).toBe("b");
});

it("preserves foreign-origin and unauthenticated rejection before the ownership check", async () => {
  expect((await POST(request("POST", undefined, "save", "https://other.test"))).status).toBe(403);
  expect(mocks.account).not.toHaveBeenCalled();
  mocks.account.mockResolvedValue(null);
  expect((await POST(request("POST"))).status).toBe(401);
  expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled();
});

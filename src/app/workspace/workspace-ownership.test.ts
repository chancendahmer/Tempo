import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ account: undefined as { cacheKey?: string; phoneVerified: boolean } | null | undefined, error: null as string | null, refresh: vi.fn() }));
const hooks = vi.hoisted(() => ({ callbacks: [] as (() => Promise<void>)[], setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock("react", async () => ({ ...await vi.importActual<typeof import("react")>("react"),
  useCallback: (callback: () => Promise<void>) => { hooks.callbacks.push(callback); return callback; },
  useState: (value: unknown) => { const setter = vi.fn(); hooks.setters.push(setter); return [value, setter]; },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("../components/account-state", () => ({ ACCOUNT_EVENT: "tempo-account-change", useAccountStatus: () => state }));
vi.mock("@/server/domain/meal-groceries", async () => await import("../../server/domain/meal-groceries"));
vi.mock("@/server/domain/life-items", async () => await import("../../server/domain/life-items"));
import { WorkspaceClient } from "./WorkspaceClient";

beforeEach(() => {
  state.account = { cacheKey: "cache:a", phoneVerified: true }; state.error = null;
  hooks.callbacks = []; hooks.setters = [];
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

it("preserves all mounted drafts and retry identities through same-owner polls and temporary outages", () => {
  const initial = WorkspaceClient({});
  state.account = { cacheKey: "cache:a", phoneVerified: true };
  const poll = WorkspaceClient({});
  expect(poll.type).toBe(initial.type); expect(poll.key).toBe(initial.key);
  state.error = "Unavailable";
  const outage = WorkspaceClient({});
  expect(outage.type).toBe(initial.type); expect(outage.key).toBe(initial.key);
  expect(outage.props).toMatchObject({ owner: "cache:a", unavailable: true });
});

it("remounts the whole stateful workspace after account switches and hides old drafts during explicit invalidation", () => {
  const a = WorkspaceClient({});
  state.account = undefined; // useAccountStatus invalidates before its replacement lookup.
  expect(WorkspaceClient({}).type).not.toBe(a.type);
  state.account = { cacheKey: "cache:b", phoneVerified: true };
  const b = WorkspaceClient({});
  expect(b.type).toBe(a.type); expect(b.key).not.toBe(a.key);
  expect(b.props).toMatchObject({ owner: "cache:b" });
  for (const account of [null, { phoneVerified: true }, { cacheKey: "cache:pending", phoneVerified: false }]) {
    state.account = account;
    expect(WorkspaceClient({}).type).not.toBe(a.type);
  }
});

it("keeps preview ownership separate and usable without an authenticated account", () => {
  state.account = null;
  const preview = WorkspaceClient({ preview: true });
  expect(preview.key).toBe("preview"); expect(preview.props).toMatchObject({ preview: true });
  expect(preview.props).not.toHaveProperty("owner");
});

function mountedRefresh() {
  // Render the real owned view; capture its refresh closure without a DOM or network.
  renderToStaticMarkup(createElement(WorkspaceClient));
  return hooks.callbacks[0];
}

it("clears a malformed 401 before attempting JSON and invalidates the account lookup", async () => {
  const json = vi.fn().mockRejectedValue(new SyntaxError("Not JSON"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false, json }));
  await mountedRefresh()();
  expect(json).not.toHaveBeenCalled();
  expect(hooks.setters[0]).toHaveBeenCalledExactlyOnceWith(null);
  expect(window.dispatchEvent).toHaveBeenCalledOnce();
});

it("never reconciles account B's snapshot into account A's mounted workspace", async () => {
  const body = { cacheKey: "cache:b", messages: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  await mountedRefresh()();
  expect(hooks.setters[0]).toHaveBeenCalledExactlyOnceWith(null);
  expect(window.dispatchEvent).toHaveBeenCalledOnce();
});

it("retains same-owner state on 503 and accepts only an owned successful snapshot", async () => {
  const body = { cacheKey: "cache:a", messages: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 })).mockResolvedValueOnce(Response.json(body)));
  const refresh = mountedRefresh();
  await refresh(); expect(hooks.setters[0]).not.toHaveBeenCalled();
  await refresh(); expect(hooks.setters[0]).toHaveBeenCalledExactlyOnceWith(body);
  expect(window.dispatchEvent).not.toHaveBeenCalled();
});

it("ignores an obsolete body even when a later request has already reconciled", async () => {
  let finishBody!: (body: unknown) => void;
  const current = { cacheKey: "cache:a", messages: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: () => new Promise(resolve => { finishBody = resolve; }) }).mockResolvedValueOnce(Response.json(current)));
  const refresh = mountedRefresh();
  const obsolete = refresh(); await Promise.resolve();
  await refresh(); finishBody({ cacheKey: "cache:b", messages: [] }); await obsolete;
  expect(hooks.setters[0]).toHaveBeenCalledExactlyOnceWith(current);
  expect(window.dispatchEvent).not.toHaveBeenCalled();
});

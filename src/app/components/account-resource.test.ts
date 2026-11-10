import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ setters: [] as ReturnType<typeof vi.fn>[], effects: [] as (() => (() => void) | undefined)[] }));
vi.mock("react", () => ({
  useState: (value: unknown) => { const set = vi.fn(); hooks.setters.push(set); return [value, set]; },
  useRef: (value: unknown) => ({ current: value }), useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | undefined) => hooks.effects.push(effect),
}));
import { resourceFailure, resourceSuccess, visibleResource, useAccountResource, type AccountResource } from "./account-resource";

describe("account-owned recovery projections", () => {
  const snapshot: AccountResource<{ title: string }> = { owner: "account-a", data: { title: "A private plan" }, error: false, unauthorized: false };
  it("retains a last verified projection as stale after a temporary failure", () => {
    expect(resourceFailure(snapshot, "account-a", false)).toEqual({ ...snapshot, error: true });
    expect(resourceFailure(null, "account-a", false)).toEqual({ owner: "account-a", data: null, error: true, unauthorized: false });
    expect(snapshot.error).toBe(false);
  });
  it("clears private projections after auth loss or a different owner", () => {
    expect(resourceFailure(snapshot, "account-a", true)).toEqual({ owner: "account-a", data: null, error: false, unauthorized: true });
    expect(resourceFailure(snapshot, "account-b", false).data).toBeNull();
    for (const owner of [null, undefined, "account-b"]) expect(visibleResource(snapshot, owner)).toBeNull();
    expect(visibleResource(snapshot, "account-a")).toBe(snapshot);
    expect(resourceSuccess({ cacheKey: "account-b", title: "B private plan" }, "account-a")).toEqual({ owner: "account-a", data: null, error: true, unauthorized: false });
  });
});

describe("projection request cancellation", () => {
  beforeEach(() => {
    hooks.setters = []; hooks.effects = [];
    vi.stubGlobal("window", { setTimeout: vi.fn(), clearTimeout: vi.fn(), setInterval: vi.fn(), clearInterval: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("ignores a body that resolves after the owned view unmounts", async () => {
    let finishBody!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(resolve => { finishBody = resolve; }) }));
    const view = useAccountResource("/api/account/board", "account-a", 30000);
    const cleanup = hooks.effects[0]();
    const pending = view.refresh(); await Promise.resolve();
    cleanup!(); finishBody({ title: "A private plan" }); await pending;
    expect(hooks.setters[0]).not.toHaveBeenCalled();
  });
  it("aborts a superseded refresh and ignores its late projection", async () => {
    const finish: ((value: Response) => void)[] = [];
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish.push(resolve); }));
    vi.stubGlobal("fetch", fetcher);
    const view = useAccountResource("/api/account/extensions", "account-a");
    hooks.effects[0]();
    const first = view.refresh(), second = view.refresh();
    const options = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(options[1].signal!.aborted).toBe(true);
    finish[0](Response.json({ title: "Old projection" }));
    finish[1](Response.json({ cacheKey: "account-a", title: "Current projection" }));
    await Promise.all([first, second]);
    expect(hooks.setters[0].mock.calls).toEqual([[{ owner: "account-a", data: { cacheKey: "account-a", title: "Current projection" }, error: false, unauthorized: false }]]);
  });
});

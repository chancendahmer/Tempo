import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ setters: [] as ReturnType<typeof vi.fn>[], effects: [] as (() => (() => void) | undefined)[] }));
vi.mock("react", () => ({
  useState: (value: unknown) => { const set = vi.fn(); hooks.setters.push(set); return [value, set]; },
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | undefined) => hooks.effects.push(effect),
}));
import { useAccountStatus } from "./account-state";

describe("account polling cancellation", () => {
  beforeEach(() => {
    hooks.setters = [];
    hooks.effects = [];
    vi.stubGlobal("window", { setTimeout: vi.fn(), clearTimeout: vi.fn(), setInterval: vi.fn(), clearInterval: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("aborts an old account lookup and ignores even a late verified response after recovery starts", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", request);
    const status = useAccountStatus(4000);
    hooks.effects[0]();
    const lookup = status.refresh();
    const signal = (request.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    status.suspend();
    expect(signal.aborted).toBe(true);
    finish(Response.json({ account: { phoneVerified: true } }));
    await lookup;
    expect(hooks.setters[0].mock.calls).toEqual([[null]]);
    expect(hooks.setters[1].mock.calls).toEqual([[null]]);
    await status.refresh();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("invalidates a response whose body resolves after the component was cleaned up", async () => {
    let finishBody!: (value: unknown) => void;
    const response = { ok: true, status: 200, json: () => new Promise(resolve => { finishBody = resolve; }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const status = useAccountStatus(4000);
    const cleanup = hooks.effects[0]();
    const lookup = status.refresh();
    await Promise.resolve();
    cleanup!();
    finishBody({ account: { phoneVerified: true } });
    await lookup;
    expect(hooks.setters[0]).not.toHaveBeenCalled();
    expect(hooks.setters[1]).not.toHaveBeenCalled();
  });

  it("does not fetch or register polling while recovery is paused", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const status = useAccountStatus(4000, false);
    expect(hooks.effects[0]()).toBeUndefined();
    await status.refresh();
    expect(request).not.toHaveBeenCalled();
    expect(window.setInterval).not.toHaveBeenCalled();
    expect(window.addEventListener).not.toHaveBeenCalled();
  });
  it("invalidates cached ownership immediately on an explicit account event", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    useAccountStatus(4000);
    hooks.effects[0]();
    const [, changed] = vi.mocked(window.addEventListener).mock.calls[0] as unknown as [string, () => void];
    changed();
    expect(hooks.setters[0].mock.calls[0]).toEqual([undefined]);
    expect(hooks.setters[1].mock.calls[0]).toEqual([null]);
    finish(Response.json({ account: { cacheKey: "new-owner", phoneVerified: true } }));
    await Promise.resolve(); await Promise.resolve();
  });
});

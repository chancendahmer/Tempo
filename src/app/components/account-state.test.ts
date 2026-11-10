import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ setters: [] as ReturnType<typeof vi.fn>[], effects: [] as (() => (() => void) | undefined)[] }));
vi.mock("react", () => ({
  useState: (value: unknown) => { const set = vi.fn(); hooks.setters.push(set); return [value, set]; },
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | undefined) => hooks.effects.push(effect),
}));
import { ACCOUNT_CHANGE_PARAM, ACCOUNT_EVENT, publishAccountChange } from "./account-change";
import { useAccountStatus } from "./account-state";

describe("account polling cancellation", () => {
  beforeEach(() => {
    hooks.setters = [];
    hooks.effects = [];
    const listeners = new EventTarget();
    const location = new URL("https://tempo.test/workspace");
    vi.stubGlobal("window", {
      location,
      history: { state: { preserved: true }, replaceState: vi.fn((_state, _title, url: URL) => { location.href = url.href; }) },
      localStorage: { setItem: vi.fn() },
      setTimeout: vi.fn(), clearTimeout: vi.fn(), setInterval: vi.fn(), clearInterval: vi.fn(),
      addEventListener: vi.fn(listeners.addEventListener.bind(listeners)),
      removeEventListener: vi.fn(listeners.removeEventListener.bind(listeners)),
      dispatchEvent: vi.fn(listeners.dispatchEvent.bind(listeners)),
    });
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
    expect(hooks.setters[2].mock.calls[0]).toEqual([null]);
    finish(Response.json({ account: { cacheKey: "new-owner", phoneVerified: true } }));
    await Promise.resolve(); await Promise.resolve();
  });
  it("rejects late old ownership after a storage signal and accepts only the new server session", async () => {
    let finishOld!: (response: Response) => void;
    let finishNew!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishNew = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const status = useAccountStatus(4000);
    const cleanup = hooks.effects[0]();
    const old = status.refresh();
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    window.dispatchEvent(Object.assign(new Event("storage"), { key: "unrelated", newValue: "1" }));
    window.dispatchEvent(Object.assign(new Event("storage"), { key: ACCOUNT_EVENT, newValue: null }));
    expect(fetcher).toHaveBeenCalledOnce();
    window.dispatchEvent(Object.assign(new Event("storage"), { key: ACCOUNT_EVENT, newValue: '{"account":{"cacheKey":"untrusted"}}' }));
    expect(signal.aborted).toBe(true);
    expect(hooks.setters[0].mock.calls).toEqual([[undefined]]);
    expect(hooks.setters[2].mock.calls).toEqual([[null]]);
    expect(window.localStorage.setItem).not.toHaveBeenCalled();

    finishOld(Response.json({ account: { cacheKey: "old", phoneVerified: true }, sessionKey: "old-session" }));
    await old;
    expect(hooks.setters[0].mock.calls).toEqual([[undefined]]);
    const newOwner = { cacheKey: "new", phoneVerified: true };
    finishNew(Response.json({ account: newOwner, sessionKey: "new-session" }));
    await vi.waitFor(() => expect(hooks.setters[0].mock.calls).toEqual([[undefined], [newOwner]]));
    expect(hooks.setters[2].mock.calls).toEqual([[null], ["new-session"]]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    cleanup!();
    window.dispatchEvent(Object.assign(new Event("storage"), { key: ACCOUNT_EVENT, newValue: "later" }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("consumes a successful auth redirect once without losing calendar or navigation parameters", () => {
    window.location.href = `https://tempo.test/extensions?calendar=connected&${ACCOUNT_CHANGE_PARAM}=1#connections`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ account: null })));
    useAccountStatus();
    useAccountStatus();
    hooks.effects.forEach(effect => effect());
    expect(window.history.replaceState).toHaveBeenCalledExactlyOnceWith({ preserved: true }, "", new URL("https://tempo.test/extensions?calendar=connected#connections"));
    expect(window.localStorage.setItem).toHaveBeenCalledExactlyOnceWith(ACCOUNT_EVENT, expect.stringMatching(/^\d+-/));
    expect(window.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("leaves other tabs alone on an ordinary new mount and revalidates locally when storage is unavailable", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ account: null })));
    useAccountStatus(4000);
    hooks.effects[0]();
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
    expect(window.setTimeout).toHaveBeenCalledOnce();
    expect(window.setInterval).toHaveBeenCalledOnce();
    vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw new Error("Unavailable"); });
    expect(publishAccountChange).not.toThrow();
    expect(hooks.setters[0]).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("observes a pending session proof separately from account identity and retains it only through a temporary lookup failure", async () => {
    const json = vi.fn().mockRejectedValue(new SyntaxError("Not JSON"));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ account: { phoneVerified: false }, sessionKey: "opaque-pending-session" }))
      .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce({ status: 401, ok: false, json }));
    const status = useAccountStatus(); hooks.effects[0]();
    await status.refresh(); expect(hooks.setters[2]).toHaveBeenCalledExactlyOnceWith("opaque-pending-session");
    await status.refresh(); expect(hooks.setters[2]).toHaveBeenCalledTimes(1);
    await status.refresh(); expect(hooks.setters[2].mock.calls.at(-1)).toEqual([null]); expect(json).not.toHaveBeenCalled();
    status.suspend(); expect(hooks.setters[2].mock.calls.at(-1)).toEqual([null]);
  });
});

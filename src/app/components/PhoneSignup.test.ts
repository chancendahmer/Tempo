import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ submitted: null as string | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("./account-state", () => ({ ACCOUNT_EVENT: "tempo-account-change", useAccountStatus: () => ({ account: null, suspend: vi.fn() }) }));
vi.mock("react", async (importOriginal) => ({ ...await importOriginal<typeof import("react")>(), useSyncExternalStore: () => state.submitted }));
import { PhoneSignup, resetPhoneSignup } from "./PhoneSignup";

describe("phone signup recovery", () => {
  beforeEach(() => { state.submitted = null; });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "true",
    "broken old marker",
    JSON.stringify({ phoneNumber: "+12025550111", messageHref: "sms:+12025550111?body=START" }),
    JSON.stringify({ phoneNumber: "+12025550111", messageHref: "sms:+12025550111?body=START", signInLinkQueued: true }),
  ])("offers recovery for every waiting state, including legacy markers (%s)", (marker) => {
    state.submitted = marker;
    const html = renderToStaticMarkup(createElement(PhoneSignup));
    expect(html).toContain("Use a different number");
    expect(html).toContain("Back to sign in");
    expect(html).not.toContain('name="phone"');
  });

  it("requires explicit consent on the fresh number form", () => {
    const html = renderToStaticMarkup(createElement(PhoneSignup));
    expect(html).toContain('name="phone"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
  });

  it("does not forget the pending claim until the server has revoked it", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const removeItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("fetch", request);
    vi.stubGlobal("window", { localStorage: { removeItem }, dispatchEvent });
    const resetting = resetPhoneSignup("observed-session");
    expect(request).toHaveBeenCalledWith("/api/auth/logout", { method: "POST", headers: { "x-tempo-session": "observed-session" } });
    expect(removeItem).not.toHaveBeenCalled();
    finish(new Response(null, { status: 200 }));
    await resetting;
    expect(removeItem).toHaveBeenCalledWith("tempo-early-access-submitted");
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(["tempo-signup-change", "tempo-account-change"]);
  });

  it.each([403, 503])("keeps recovery retryable when revocation fails (%s)", async (status) => {
    const removeItem = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    vi.stubGlobal("window", { localStorage: { removeItem }, dispatchEvent: vi.fn() });
    await expect(resetPhoneSignup("observed-session")).rejects.toThrow("Please try again");
    expect(removeItem).not.toHaveBeenCalled();
  });
});


it("never forgets a pending claim or retries automatically after the browser session changes", async () => {
  const removeItem = vi.fn(), dispatchEvent = vi.fn();
  const fetcher = vi.fn().mockResolvedValue(new Response("not JSON", { status: 409 }));
  vi.stubGlobal("fetch", fetcher); vi.stubGlobal("window", { localStorage: { removeItem }, dispatchEvent });
  await expect(resetPhoneSignup("old-session")).rejects.toThrow("Reload this page");
  expect(removeItem).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledOnce();
  expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(["tempo-account-change"]);
  vi.unstubAllGlobals();
});

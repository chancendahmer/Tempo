import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicAccount } from "./account-state";

const state = vi.hoisted(() => ({
  account: null as PublicAccount | null | undefined, error: null as string | null,
  data: null as unknown, unavailable: false, unauthorized: false, loading: false, refresh: vi.fn(),
}));
vi.mock("./account-state", () => ({ ACCOUNT_EVENT: "tempo-account-change", useAccountStatus: () => ({ account: state.account, error: state.error, refresh: state.refresh }) }));
vi.mock("./account-resource", () => ({ useAccountResource: () => ({ data: state.data, unavailable: state.unavailable, unauthorized: state.unauthorized, loading: state.loading, refresh: state.refresh }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { ProfileClient } from "../profile/ProfileClient";
import { BoardClient } from "../board/BoardClient";
import { ExtensionsClient } from "../extensions/ExtensionsClient";

const account: PublicAccount = { cacheKey: "owner-a", displayName: "Known profile", phoneLast4: "1234", phoneVerified: true, onboardingState: "complete", profileInstructions: "Known instructions", profileComplete: true, calendarStatus: "active" };
const render = (component: typeof ProfileClient) => renderToStaticMarkup(createElement(component));

describe("recoverable account views", () => {
  beforeEach(() => { Object.assign(state, { account, error: null, data: null, unavailable: false, unauthorized: false, loading: false }); state.refresh.mockReset(); });
  it("labels an initial profile lookup outage as unavailable instead of incomplete setup", () => {
    state.account = null; state.error = "Account unavailable";
    const html = render(ProfileClient);
    expect(html).toContain("Your profile is temporarily unavailable");
    expect(html).toContain("Try again"); expect(html).not.toContain("Finish the text setup");
  });
  it("retains a known profile as stale and disables saving until account recovery", () => {
    state.error = "Account unavailable";
    const html = render(ProfileClient);
    expect(html).toContain("Known instructions"); expect(html).toContain("last known profile");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
    expect(html).toContain("Try again");
  });
  it("keys draft and projection lifetimes to stable ownership, not poll object identity", () => {
    function keyOf(component: typeof ProfileClient) {
      let key: string | null = null;
      function Capture() { const element = component(); key = element.key; return element; }
      renderToStaticMarkup(createElement(Capture));
      return key;
    }
    const keys = [ProfileClient, BoardClient, ExtensionsClient].map(keyOf);
    state.account = { ...account, displayName: "Updated same owner" };
    expect([ProfileClient, BoardClient, ExtensionsClient].map(keyOf)).toEqual(keys);
    state.account = { ...account, cacheKey: "owner-b" };
    const other = [ProfileClient, BoardClient, ExtensionsClient].map(keyOf);
    other.forEach((key, index) => expect(key).not.toBe(keys[index]));
  });
  it("retains a stale board visibly but prevents outdated spoken briefings", () => {
    state.data = { cacheKey: "owner-a", timezone: "UTC", generatedAt: "2026-10-22T12:00:00Z", tasks: [{ id: "task", title: "Known board task", status: "not_started", dueAt: null, estimatedMinutes: 5 }], reminders: [], calendar: null, busy: [] };
    state.unavailable = true;
    const html = render(BoardClient);
    expect(html).toContain("Known board task"); expect(html).toContain("last known board");
    expect(html).toMatch(/<button disabled="">Read my briefing aloud/);
    expect(html).toContain("Try again");
  });
  it("does not label failed connection lookup as disconnected or expose stale action links", () => {
    state.unavailable = true;
    let html = render(ExtensionsClient);
    expect(html).toContain("Unavailable"); expect(html).not.toContain("Not connected");
    expect(html).toContain("Try again");
    state.data = { cacheKey: "owner-a", calendar: { status: "active", connectUrl: "/private-old-connect", disconnectUrl: "/private-old-disconnect" } };
    html = render(ExtensionsClient);
    expect(html).toContain("Connected"); expect(html).toContain("last known connection status");
    expect(html).not.toContain("private-old-connect"); expect(html).not.toContain("private-old-disconnect");
  });
  it("keeps explicit auth loss separate from temporary service failure", () => {
    state.account = null;
    expect(render(ProfileClient)).toContain("Finish the text setup");
    expect(render(BoardClient)).toContain("Log in to open your board");
    expect(render(ExtensionsClient)).toContain("Log in to add extensions");
    state.account = account; state.unauthorized = true;
    expect(render(ExtensionsClient)).toContain("Log in to manage extensions");
    expect(render(BoardClient)).toContain("Log in to open your board");
  });
});

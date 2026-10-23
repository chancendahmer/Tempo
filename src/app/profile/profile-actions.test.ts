import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ setters: [] as ReturnType<typeof vi.fn>[], refresh: vi.fn(), push: vi.fn(), account: { cacheKey: "owner-a", phoneVerified: true, displayName: "Known name", profileInstructions: "Known draft" } }));
vi.mock("react", async () => ({ ...await vi.importActual<typeof import("react")>("react"), useState: (value: unknown) => { const setter = vi.fn(); fixture.setters.push(setter); return [value, setter]; } }));
vi.mock("../components/account-state", () => ({ ACCOUNT_EVENT: "tempo-account-change", useAccountStatus: () => ({ account: fixture.account, sessionKey: "observed-session-a", error: null, refresh: fixture.refresh }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: fixture.push, refresh: vi.fn() }) }));
import { ProfileClient } from "./ProfileClient";

function find(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, match); if (result) return result; } return; }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  return match(node) ? node : find(node.props.children as ReactNode, match);
}
function editor() {
  const owner = ProfileClient();
  const view = owner.type as (props: typeof owner.props) => ReactElement;
  return { owner, tree: view(owner.props) };
}
beforeEach(() => {
  fixture.setters = []; fixture.refresh.mockClear(); fixture.push.mockClear();
  fixture.account.cacheKey = "owner-a";
  vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage: { removeItem: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps successful save feedback mounted with a scoped refresh and clears the notice on the next edit", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ account: fixture.account })); vi.stubGlobal("fetch", fetcher);
  const { owner, tree } = editor();
  const form = find(tree, node => node.type === "form")!;
  await (form.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} });
  expect(fixture.setters[4]).toHaveBeenCalledWith("Saved. Tempo will use these instructions in future coaching.");
  expect(fixture.refresh).toHaveBeenCalledOnce(); expect(window.dispatchEvent).not.toHaveBeenCalled();
  expect(ProfileClient().key).toBe(owner.key);
  const input = find(tree, node => node.type === "input")!;
  (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Next edit" } });
  expect(fixture.setters[4].mock.calls.at(-1)).toEqual([""]);
  fixture.account.cacheKey = "owner-b"; expect(ProfileClient().key).not.toBe(owner.key);
});

it.each([401, 409])("does not clear storage or retry logout after status%s, even with a malformed body", async status => {
  const json = vi.fn().mockRejectedValue(new SyntaxError("Not JSON"));
  const fetcher = vi.fn().mockResolvedValue({ status, ok: false, json }); vi.stubGlobal("fetch", fetcher);
  const { tree } = editor();
  const logout = find(tree, node => node.type === "button" && typeof node.props.onClick === "function")!;
  await (logout.props.onClick as () => Promise<void>)();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/auth/logout", { method: "POST", headers: { "x-tempo-session": "observed-session-a" } });
  expect(json).not.toHaveBeenCalled(); expect(window.localStorage.removeItem).not.toHaveBeenCalled();
  expect(fixture.push).not.toHaveBeenCalled(); expect(window.dispatchEvent).toHaveBeenCalledOnce();
});

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const index = state.cursor++; const setter = vi.fn(); state.setters[index] = setter; return [state.values[index] ?? initial, setter]; },
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../components/account-state", () => ({ ACCOUNT_EVENT: "tempo-account-change", useAccountStatus: () => ({
  account: { cacheKey: "owner-a", displayName: "Owner A draft", phoneLast4: "1234", phoneVerified: true, profileInstructions: "A instructions" }, error: null, refresh: vi.fn(),
}) }));
import { ProfileClient } from "./ProfileClient";

function findForm(node: ReactNode): ReactElement<{ onSubmit: (event: { preventDefault(): void }) => Promise<void> }> | undefined {
  if (Array.isArray(node)) return node.map(findForm).find(Boolean);
  if (!isValidElement(node)) return;
  if (node.type === "form") return node as ReturnType<typeof findForm>;
  return findForm((node.props as { children?: ReactNode }).children);
}
beforeEach(() => {
  state.cursor = 0; state.values = []; state.setters = [];
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  { status: 409, recovery: "owner", message: "Check your signed-in account" },
  { status: 401, recovery: "auth", message: "Log in to your profile" },
])("binds a profile save to its rendered owner and immediately discards the form after $status", async scenario => {
  // A confirmed auth/ownership status must invalidate even without a JSON error body.
  const fetcher = vi.fn().mockResolvedValue(new Response("Unavailable error body", { status: scenario.status }));
  vi.stubGlobal("fetch", fetcher);
  const profile = ProfileClient();
  const editor = (profile.type as (props: unknown) => ReactElement)(profile.props);
  const form = findForm(editor)!;
  await form.props.onSubmit({ preventDefault() {} });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ displayName: "Owner A draft", profileInstructions: "A instructions", expectedCacheKey: "owner-a" });
  expect(state.setters[0]).toHaveBeenCalledExactlyOnceWith(scenario.recovery);
  expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "tempo-account-change" }));
  state.cursor = 0; state.values[0] = scenario.recovery;
  const recovery = ProfileClient();
  expect(findForm(recovery)).toBeUndefined();
  expect(JSON.stringify(recovery)).toContain("Your changes were not saved");
  expect(JSON.stringify(recovery)).toContain(scenario.message);
  expect(JSON.stringify(recovery)).not.toContain("Owner A draft");
  if (scenario.status === 401) expect(JSON.stringify(recovery)).toContain("/login");
});

it("retains the draft after a 403 origin rejection rather than treating it as auth loss", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Invalid request origin." }, { status: 403 })));
  const profile = ProfileClient();
  const editor = (profile.type as (props: unknown) => ReactElement)(profile.props);
  await findForm(editor)!.props.onSubmit({ preventDefault() {} });
  expect(state.setters[0]).not.toHaveBeenCalled();
  expect(window.dispatchEvent).not.toHaveBeenCalled();
  expect(JSON.stringify(editor)).toContain("Owner A draft");
  expect(findForm(editor)).toBeDefined();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Workspace } from "./workspace-data";

const hooks = vi.hoisted(() => ({ value: undefined as unknown, writes: [] as unknown[], effects: [] as (() => (() => void) | undefined)[] }));
vi.mock("react", async () => ({ ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    if (hooks.value === undefined) hooks.value = initial;
    return [hooks.value, (next: unknown) => { hooks.value = typeof next === "function" ? (next as (current: unknown) => unknown)(hooks.value) : next; hooks.writes.push(hooks.value); }];
  },
  useEffect: (effect: () => (() => void) | undefined) => hooks.effects.push(effect),
}));
import { useCalendarEvents } from "./use-calendar-events";

const fixture = (owner: string) => ({ cacheKey: owner, timezone: "UTC", calendar: { status: "active" }, profile: { phoneLast4: "1111" } }) as Workspace;
const payload = (owner: string) => ({ cacheKey: owner, events: [{ id: "private-event", title: "Synthetic event", start: { dateTime: "2026-10-22T12:00:00Z" }, end: { dateTime: "2026-10-22T13:00:00Z" }, editable: false }], fetchedAt: "2026-10-22T12:00:00Z" });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => {
  hooks.value = undefined; hooks.writes = []; hooks.effects = [];
  vi.useFakeTimers(); vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["cache:a", "cache:b"])("ignores a late %s body after the owned calendar unmounts, including owner-error events", async responseOwner => {
  let finish!: (body: unknown) => void;
  const fetcher = vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
  vi.stubGlobal("fetch", fetcher);
  useCalendarEvents(fixture("cache:a"), "2026-10-22", false);
  const cleanup = hooks.effects[0](); await flush();
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  expect(hooks.writes).toHaveLength(1); cleanup!(); expect(signal.aborted).toBe(true);
  finish(payload(responseOwner)); await flush();
  expect(hooks.writes).toHaveLength(1); expect(window.dispatchEvent).not.toHaveBeenCalled();
});

it("hides an earlier owner's events immediately even when phone suffix, timezone, day and connection status match", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload("cache:a"))));
  useCalendarEvents(fixture("cache:a"), "2026-10-22", false);
  const cleanup = hooks.effects[0](); await flush();
  expect(useCalendarEvents(fixture("cache:a"), "2026-10-22", false).events).toHaveLength(1);
  expect(useCalendarEvents(fixture("cache:b"), "2026-10-22", false).events).toBeUndefined();
  cleanup!();
});

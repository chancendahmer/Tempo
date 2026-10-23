import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useEffect: vi.fn(),
  useRef: () => ({ current: null }),
}));
vi.mock("next/image", () => ({ default: "img" }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("./use-calendar-events", () => ({ useCalendarEvents: () => ({ events: [], disconnected: true }) }));
import { TodayView } from "./TodayView";
import { previewWorkspace } from "./workspace-data";
import { readHomePreferences } from "../../server/domain/home-preferences";

type Element = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!isValidElement(node)) return;
  const element = node as Element;
  if (predicate(element)) return element;
  return find(element.props.children as ReactNode, predicate);
}
const now = new Date("2026-10-22T18:00:00Z");
const submitted = { morningTime: "07:00", dinnerTime: "14:00", eveningTime: "22:00", workoutLeadMinutes: "30", pinned: "auto" };
beforeEach(() => {
  hooks.cursor = 0; hooks.values = [];
  vi.stubGlobal("FormData", class { get(name: string) { return submitted[name as keyof typeof submitted] ?? null; } });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps the opened preferences baseline through polling, preserves a rejected draft, and reloads it only after reopening", async () => {
  const data = previewWorkspace(now);
  const initial = { ...readHomePreferences({}), dinnerTime: "18:30" };
  data.homePreferences = initial;
  const saveHome = vi.fn().mockResolvedValue(false);
  const render = () => {
    hooks.cursor = 0;
    return TodayView({ data, now, saving: false, motion: false, setMotion: vi.fn(), go: vi.fn(), editTask: vi.fn(), startTask: vi.fn(), completeTask: vi.fn(), checkStep: vi.fn(), startStep: vi.fn(), editRoutine: vi.fn(), ask: vi.fn(), onSetup: vi.fn(), saveHome });
  };
  const click = (node: ReactNode, label: string) => (find(node, element => element.props["aria-label"] === label)!.props.onClick as () => void)();
  click(render(), "Customize home");
  const latest = { ...initial, dinnerTime: "20:00", workoutLeadMinutes: 60 };
  data.homePreferences = latest; // Same-owner background poll while this form is open.
  const opened = render();
  expect(find(opened, element => element.props.name === "dinnerTime")!.props.defaultValue).toBe("18:30");
  const form = find(opened, element => element.type === "form")!;
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {}, currentTarget: {} });
  await Promise.resolve();
  expect(saveHome).toHaveBeenCalledExactlyOnceWith({ ...submitted, workoutLeadMinutes: 30 }, initial);
  const rejected = render();
  expect(find(rejected, element => element.type === "form")).toBeDefined();
  expect(find(rejected, element => element.props.role === "alert")!.props.children).toContain("close and reopen");
  expect(data.homePreferences).toEqual(latest);
  click(rejected, "Close settings");
  click(render(), "Customize home");
  expect(find(render(), element => element.props.name === "dinnerTime")!.props.defaultValue).toBe("20:00");
});

it("pins against current saved preferences without requiring an open settings draft", async () => {
  const data = previewWorkspace(now);
  data.homePreferences = { ...readHomePreferences({}), dinnerTime: "19:00" };
  const saveHome = vi.fn().mockResolvedValue(true);
  const view = TodayView({ data, now, saving: false, motion: false, setMotion: vi.fn(), go: vi.fn(), editTask: vi.fn(), startTask: vi.fn(), completeTask: vi.fn(), checkStep: vi.fn(), startStep: vi.fn(), editRoutine: vi.fn(), ask: vi.fn(), onSetup: vi.fn(), saveHome });
  (find(view, element => element.props["aria-label"] === "Pin this home banner")!.props.onClick as () => void)();
  await Promise.resolve();
  expect(saveHome).toHaveBeenCalledWith(expect.objectContaining({ pinned: expect.not.stringMatching("auto") }), data.homePreferences);
});

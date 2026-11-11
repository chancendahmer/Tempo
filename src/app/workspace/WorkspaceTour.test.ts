import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceTour } from "./WorkspaceTour";
import { positionTour } from "./tour-position";

const hooks = vi.hoisted(() => ({ index: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [hooks.index, (value: number) => { hooks.index = value; }],
  useRef: () => ({ current: null }),
  useId: () => "tour-id",
  useLayoutEffect: () => undefined,
}));

type Item = ReactElement<{ children?: ReactNode; onClick: () => void; "aria-label"?: string; href?: string }>;
function find(node: ReactNode, match: (item: Item) => boolean): Item | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, match)).find(Boolean);
  if (!isValidElement(node)) return undefined;
  const item = node as Item;
  return match(item) ? item : find(item.props.children, match);
}

function label(node: ReactNode, text: string) {
  function hasText(content: ReactNode): boolean {
    if (Array.isArray(content)) return content.some(hasText);
    if (isValidElement(content)) return hasText((content as Item).props.children);
    return typeof content === "string" && content.trim() === text;
  }
  return find(node, item => (item.type === "button" || item.type === "h2") && (item.props["aria-label"] === text || hasText(item.props.children)));
}

beforeEach(() => { hooks.index = 0; });

function fixture(preview = false, hasTasks = true) {
  const onClose = vi.fn();
  const onSection = vi.fn();
  const render = () => WorkspaceTour({ preview, hasTasks, scope: { current: null }, onSection, onClose });
  const click = (text: string) => label(render(), text)!.props.onClick();
  return { render, click, onClose, onSection };
}

it("visits the workspace sections in order and lets users go back", () => {
  const { render, click, onClose, onSection } = fixture();
  expect(label(render(), "Find your spaces")).toBeDefined();
  for (let i = 0; i < 6; i++) click("Next");
  expect(onSection.mock.calls.flat()).toEqual(["today", "today", "inbox", "today", "settings", "settings"]);
  expect(label(render(), "Choose your check-ins")).toBeDefined();
  click("Back");
  expect(label(render(), "Bring your calendar along")).toBeDefined();
  click("Next");
  expect(onClose).not.toHaveBeenCalled();
  click("Open Settings");
  expect(onClose).toHaveBeenCalledExactlyOnceWith("settings");
});

it("offers phone signup only in the preview and can finish without opening it", () => {
  const { render, click, onClose } = fixture(true);
  for (let i = 0; i < 7; i++) click("Next");
  expect(label(render(), "Make it your workspace")).toBeDefined();
  expect(find(render(), item => item.props.href === "/#early-access")).toBeDefined();
  click("Done");
  expect(onClose).toHaveBeenCalledExactlyOnceWith();
});

it("explains how to add a task in an empty workspace", () => {
  const { render, click } = fixture(false, false);
  click("Next");
  click("Next");
  expect(find(render(), item => item.type === "p")?.props.children).toContain("Add a task here");
});

it.each(["Close tour", "Skip tour", "Escape"])("dismisses through %s", text => {
  const { render, click, onClose, onSection } = fixture();
  if (text === "Escape") {
    const preventDefault = vi.fn();
    render().props.onCancel({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  } else click(text);
  expect(onClose).toHaveBeenCalledExactlyOnceWith();
  expect(onSection).not.toHaveBeenCalled();
});

it("places a bubble under a top control without covering it", () => {
  const { highlight, panel } = positionTour({ top: 18, bottom: 58, left: 230, right: 334 }, { width: 398, height: 230 }, { width: 1280, height: 900 });
  expect(panel.side).toBe("below");
  expect(panel.top).toBeGreaterThan(highlight!.bottom);
  expect(panel.left + panel.pointer).toBe(282);
});

it("keeps the bubble above a mobile composer near the bottom edge", () => {
  const { highlight, panel } = positionTour({ top: 617, bottom: 674, left: 16, right: 344 }, { width: 336, height: 248 }, { width: 360, height: 690 });
  expect(panel.side).toBe("above");
  expect(panel.left).toBe(12);
  expect(panel.top + 248).toBeLessThan(highlight!.top);
});

it("centers the guide when the target is unavailable", () => {
  const { highlight, panel } = positionTour(null, { width: 336, height: 248 }, { width: 360, height: 690 });
  expect(highlight).toBeNull();
  expect(panel).toMatchObject({ side: "center", left: 12, top: 221 });
});

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceTour } from "./WorkspaceTour";

const hooks = vi.hoisted(() => ({ index: 0, close: vi.fn(), showModal: vi.fn() }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [hooks.index, (update: (value: number) => number) => { hooks.index = update(hooks.index); }],
  useRef: () => ({ current: { close: hooks.close, showModal: hooks.showModal } }),
  useEffect: (effect: () => void) => effect(),
}));

type Button = ReactElement<{ children?: ReactNode; onClick: () => void; "aria-label"?: string }>;
function button(node: ReactNode, label: string): Button | undefined {
  if (Array.isArray(node)) return node.map(child => button(child, label)).find(Boolean);
  if (!isValidElement(node)) return undefined;
  const item = node as Button;
  const text = Array.isArray(item.props.children) ? item.props.children[0] : item.props.children;
  if (item.type === "button" && (item.props["aria-label"] === label || text === label)) return item;
  return button(item.props.children, label);
}

beforeEach(() => { hooks.index = 0; hooks.close.mockClear(); hooks.showModal.mockClear(); });

function fixture() {
  const focus = vi.fn();
  const opener = { isConnected: true, focus } as unknown as HTMLElement;
  const onClose = vi.fn();
  const onGo = vi.fn();
  const render = () => WorkspaceTour({ opener, onClose, onGo });
  return { render, focus, onClose, onGo };
}

it("returns focus to the opener after all four steps are completed", () => {
  const { render, focus, onClose, onGo } = fixture();
  for (let step = 0; step < 3; step++) button(render(), "Next")!.props.onClick();
  expect(hooks.close).not.toHaveBeenCalled();
  button(render(), "Got it")!.props.onClick();
  expect(hooks.close).toHaveBeenCalledOnce();
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(hooks.close).toHaveBeenCalledBefore(focus);
  expect(onClose).toHaveBeenCalledOnce();
  expect(onGo).not.toHaveBeenCalled();
});

it.each(["Close tour", "Skip tour", "Escape"])("returns focus when dismissing through %s", label => {
  const { render, focus, onClose } = fixture();
  const dialog = render();
  if (label === "Escape") {
    const preventDefault = vi.fn();
    dialog.props.onCancel({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  } else button(dialog, label)!.props.onClick();
  expect(hooks.close).toHaveBeenCalledOnce();
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(onClose).toHaveBeenCalledOnce();
});

it.each([["Go to Today", "today"], ["Open Planner", "tasks"]] as const)("lets %s focus its destination", (label, destination) => {
  const { render, focus, onClose, onGo } = fixture();
  if (destination === "tasks") button(render(), "Next")!.props.onClick();
  button(render(), label)!.props.onClick();
  expect(onGo).toHaveBeenCalledExactlyOnceWith(destination);
  expect(focus).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceAccountMenu } from "./WorkspaceAccountMenu";

const hooks = vi.hoisted(() => ({ open: false, refs: 0, focus: vi.fn() }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [hooks.open, (value: boolean) => { hooks.open = value; }],
  useId: () => "workspace-account-panel",
  useRef: () => ({ current: hooks.refs++ === 1 ? { focus: hooks.focus } : null }),
  useEffect: vi.fn(),
}));

type Button = ReactElement<{ children?: ReactNode; disabled?: boolean; onClick: () => void; "aria-expanded"?: boolean }>;
function button(node: ReactNode, action?: string): Button | undefined {
  if (Array.isArray(node)) return node.map(child => button(child, action)).find(Boolean);
  if (!isValidElement(node)) return undefined;
  const item = node as Button;
  if (item.type === "button" && (action === undefined
    ? typeof item.props["aria-expanded"] === "boolean"
    : Array.isArray(item.props.children) && item.props.children.includes(action))) return item;
  return button(item.props.children, action);
}

function fixture(initiallyHidden = false) {
  let hidden = initiallyHidden;
  const settings = vi.fn(), signOut = vi.fn(), onOpen = vi.fn();
  const togglePrivacy = vi.fn(() => { hidden = !hidden; });
  const render = () => {
    hooks.refs = 0;
    return WorkspaceAccountMenu({ profile: { displayName: "QA Willow", phoneLast4: "0162" },
      preview: false, saving: false, hidden, settings, signOut, onOpen, togglePrivacy });
  };
  const open = () => { button(render())!.props.onClick(); return render(); };
  return { render, open, settings, signOut, onOpen, togglePrivacy };
}

beforeEach(() => { hooks.open = false; hooks.focus.mockClear(); });

it("dismisses the open account disclosure with Escape and returns focus to its trigger", () => {
  const { render, open, onOpen } = fixture();
  const opened = open();
  expect(button(opened)!.props["aria-expanded"]).toBe(true);
  expect(onOpen).toHaveBeenCalledOnce();
  const preventDefault = vi.fn();
  opened.props.onKeyDown({ key: "Escape", preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(hooks.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(button(render())!.props["aria-expanded"]).toBe(false);
});

it.each([["Settings", "settings"], ["Switch account / Log out", "signOut"]] as const)(
  "closes the disclosure and invokes the existing %s handler", (action, handler) => {
    const menu = fixture();
    button(menu.open(), action)!.props.onClick();
    expect(menu[handler]).toHaveBeenCalledOnce();
    expect(button(menu.render())!.props["aria-expanded"]).toBe(false);
  },
);

it("covers both forms of account identity and keeps reveal and sign-out available", () => {
  const menu = fixture();
  const visible = menu.open();
  expect(renderToStaticMarkup(visible)).toContain("Phone ending in 0162");
  button(visible, "Hide private content")!.props.onClick();
  expect(menu.togglePrivacy).toHaveBeenCalledOnce();
  expect(hooks.focus).toHaveBeenCalledWith({ preventScroll: true });

  const covered = menu.open();
  const markup = renderToStaticMarkup(covered);
  expect(markup).not.toContain("QA Willow");
  expect(markup).not.toContain("0162");
  expect(markup).not.toContain("Hide private content");
  expect(button(covered, "Switch account / Log out")!.props.disabled).toBe(false);
  button(covered, "Show workspace")!.props.onClick();
  expect(renderToStaticMarkup(menu.open())).toContain("Phone ending in 0162");
});

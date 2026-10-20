import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { findThoughts, ThoughtsView } from "./ThoughtsView";
import { previewWorkspace } from "./workspace-data";

it("finds words across saved titles and bodies without including other record kinds", () => {
  const items = previewWorkspace().items;
  const before = JSON.stringify(items);
  const found = findThoughts(items, "  SUNDAY   fridge  ");
  expect(found).toHaveLength(1);
  expect(found[0].data.title).toBe("A smaller Sunday reset");
  expect(findThoughts(items, "not-a-saved-phrase")).toEqual([]);
  expect(findThoughts(items, "").every(item => item.data.kind === "note")).toBe(true);
  expect(JSON.stringify(items)).toBe(before);
});

it("keeps complete note text available and labels partial search coverage honestly", () => {
  const items = previewWorkspace().items.filter(item => item.data.kind === "note").slice(0, 1);
  items[0].data = { kind: "note", title: "Full project idea", body: "Useful details. ".repeat(30) + "Keep the final constraint." };
  const html = renderToStaticMarkup(createElement(ThoughtsView, { items, truncated: true, saving: false, edit: vi.fn(), remove: vi.fn(), toTask: vi.fn(), toGoal: vi.fn() }));
  expect(html).toContain('aria-label="Read full thought: Full project idea"');
  expect(html).toContain("Keep the final constraint.");
  expect(html).toContain("Searching the thoughts loaded here.");
  expect(html).toContain("Your original note stays here.");
});

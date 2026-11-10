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

it("links the created task, labels completion and never offers another conversion after removal", () => {
  const taskId = "00000000-0000-4000-8000-000000000099";
  const task = { id: taskId, title: "Call the studio", status: "completed", estimatedMinutes: 5, dueAt: null, startedAt: null, goalId: null };
  const item = { id: "thought", version: 2, data: { kind: "note" as const, title: "Studio opening", body: "Keep all original details", taskId }, linkedTask: task };
  const props = { saving: false, edit: vi.fn(), remove: vi.fn(), toTask: vi.fn(), toGoal: vi.fn(), openTask: vi.fn() };
  const html = renderToStaticMarkup(createElement(ThoughtsView, { ...props, items: [item] }));
  expect(html).toContain("Completed: Call the studio");
  expect(html).toContain("Open task");
  expect(html).toContain("Keep all original details");
  expect(html).not.toContain("Add to To-do");
  for (const linkedTask of [null, { ...task, status: "abandoned" }]) {
    const removed = renderToStaticMarkup(createElement(ThoughtsView, { ...props, items: [{ ...item, linkedTask }] }));
    expect(removed).toContain("task made from this thought was removed");
    expect(removed).not.toContain("Open task");
    expect(removed).not.toContain("Add to To-do");
  }
});

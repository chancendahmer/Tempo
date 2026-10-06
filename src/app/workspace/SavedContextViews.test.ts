import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { TasksView } from "./PlanningViews";
import { SavedContextViews } from "./SavedContextViews";
import { previewWorkspace } from "./workspace-data";

it("shows a newly saved undated task in the default Tasks view", () => {
  const data = previewWorkspace();
  data.tasks = [{ ...data.tasks[0], title: "Renew passport", dueAt: null }];
  const html = renderToStaticMarkup(createElement(TasksView, { data, today: "2026-10-06", saving: false, edit: vi.fn(), start: vi.fn(), complete: vi.fn(), remove: vi.fn() }));
  expect(html).toContain("Renew passport");
  expect(html).toContain('aria-label="Remove Renew passport"');
});

it("renders stored facts and past reminders with accessible removal controls", () => {
  const data = previewWorkspace();
  data.memories = [{ id: "memory", content: "Keys in blue bowl", category: "fact" }];
  const memory = renderToStaticMarkup(createElement(SavedContextViews, { section: "memories", data, saving: false, remove: vi.fn() }));
  expect(memory).toContain('aria-label="Remove Keys in blue bowl"');
  data.reminders = [{ id: "reminder", text: "Book class", status: "sent", remindAt: "2026-09-01T12:00:00Z" }];
  const reminders = renderToStaticMarkup(createElement(SavedContextViews, { section: "reminders", data, saving: false, remove: vi.fn() }));
  expect(reminders).toContain('aria-label="Remove Book class"');
  expect(reminders).toContain("sent");
});

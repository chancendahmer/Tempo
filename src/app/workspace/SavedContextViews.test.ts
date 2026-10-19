import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GoalsView, TasksView } from "./PlanningViews";
import { SavedContextViews } from "./SavedContextViews";
import { previewWorkspace } from "./workspace-data";

it("shows a newly saved undated task in the default Tasks view", () => {
  const data = previewWorkspace();
  data.tasks = [{ ...data.tasks[0], title: "Renew passport", dueAt: null }];
  const html = renderToStaticMarkup(createElement(TasksView, { data, today: "2026-10-06", saving: false, edit: vi.fn(), start: vi.fn(), complete: vi.fn(), reopen: vi.fn(), remove: vi.fn() }));
  expect(html).toContain("Renew passport");
  expect(html).toContain('aria-label="Remove Renew passport"');
});

it("renders stored facts and past reminders with accessible removal controls", () => {
  const data = previewWorkspace();
  data.memories = [{ id: "memory", content: "Keys in blue bowl", category: "fact" }];
  const memory = renderToStaticMarkup(createElement(SavedContextViews, { section: "memories", data, saving: false, remove: vi.fn(), ask: vi.fn() }));
  expect(memory).toContain('aria-label="Remove Keys in blue bowl"');
  data.reminders = [{ id: "reminder", text: "Book class", status: "sent", remindAt: "2026-09-01T12:00:00Z" }];
  const reminders = renderToStaticMarkup(createElement(SavedContextViews, { section: "reminders", data, saving: false, remove: vi.fn(), ask: vi.fn() }));
  expect(reminders).toContain('aria-label="Remove Book class"');
  expect(reminders).toContain("sent");
});

it("exposes Mark achieved directly when all goal steps are complete, and keeps Add a step available", () => {
  const data = previewWorkspace();
  data.goals = [{ ...data.goals[0], status: "active" }];
  data.tasks = [{ ...data.tasks[0], goalId: data.goals[0].id, status: "completed" }];
  const render = (saving = false) => renderToStaticMarkup(createElement(GoalsView, { data, saving, edit: vi.fn(), addStep: vi.fn(), editStep: vi.fn(), achieve: vi.fn(), remove: vi.fn() }));
  const [visible, details] = render().split("<details");
  expect(visible).toContain("Mark achieved</button>");
  expect(visible).toContain("Add a step</button>");
  expect(details).not.toContain("Mark achieved</button>");
  const disabledAchieve = render(true).match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button => button.includes("Mark achieved</button>"));
  expect(disabledAchieve).toContain('disabled=""');
  data.tasks[0].status = "not_started";
  const [unfinished, unfinishedOptions] = render().split("<details");
  expect(unfinished).not.toContain("Mark achieved</button>");
  expect(unfinishedOptions).toContain("Mark achieved</button>");
});

it("distinguishes overdue scheduled reminders from upcoming, sending and delivered records in the account timezone", () => {
  const data = previewWorkspace();
  data.timezone = "America/Los_Angeles";
  const now = new Date("2026-10-19T00:00:00Z");
  data.reminders = [
    { id: "overdue", text: "Past scheduled reminder", status: "scheduled", remindAt: "2026-10-17T00:00:00Z" },
    { id: "upcoming", text: "Future reminder", status: "scheduled", remindAt: "2026-10-20T00:00:00Z" },
    { id: "exact", text: "Due right now", status: "scheduled", remindAt: now.toISOString() },
    { id: "sending", text: "In flight", status: "sending", remindAt: "2026-10-17T00:00:00Z" },
    { id: "sent", text: "Previously delivered", status: "sent", remindAt: "2026-10-17T00:00:00Z" },
  ];
  const html = renderToStaticMarkup(createElement(SavedContextViews, { section: "reminders", data, now, saving: false, remove: vi.fn(), ask: vi.fn() }));
  expect(html.match(/Overdue · scheduled/g)).toHaveLength(1);
  expect(html).toContain(new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(data.reminders[0].remindAt)));
  expect(html).toContain("America/Los_Angeles");
  expect(html).not.toContain("Overdue · sending");
  expect(html).not.toContain("Overdue · sent");
  expect(html).toContain("This reminder is being sent and cannot be recalled.");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Remove In flight"/);
  expect(html).toContain('aria-label="Remove Previously delivered"');
});

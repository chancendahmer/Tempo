import { isDeepStrictEqual } from "node:util";
import type { Step, Workspace } from "./workspace-journey";

type RecordWithId = { id: string };
function delta<T extends RecordWithId>(before: T[], after: T[]) {
  return {
    added: after.filter(row => !before.some(old => old.id === row.id)),
    removed: before.filter(row => !after.some(next => next.id === row.id)),
    edited: after.filter(row => before.some(old => old.id === row.id && !isDeepStrictEqual(old, row))),
  };
}

/** Ignore generated timestamps and chat growth, but detect every product-record change. */
export function workspaceProductState(workspace: Workspace) {
  const sorted = <T extends RecordWithId>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return { items: sorted(workspace.items), tasks: sorted(workspace.tasks), goals: sorted(workspace.goals),
    reminders: sorted(workspace.reminders), profile: workspace.profile, calendar: workspace.calendar, busy: sorted(workspace.busy) };
}

export function evaluateWorkspaceChange(step: Step, before: Workspace, after: Workspace): string[] {
  const issues: string[] = [];
  if (!step.verify(after)) issues.push("Requested state was not found.");
  const items = delta(before.items, after.items);
  if (step.create) {
    if (items.added.length !== 1 || items.added[0]?.data.kind !== step.create.kind || items.removed.length || items.edited.length) issues.push("Create changed extra or incorrect life items.");
  } else if (step.edit) {
    const edited = items.edited[0];
    const old = before.items.find(row => row.id === edited?.id);
    if (items.added.length || items.removed.length || items.edited.length !== 1 || !old || old.data.kind !== step.edit.kind
      || !isDeepStrictEqual(edited.data, { ...old.data, ...step.edit.patch }) || edited.version !== old.version + 1) issues.push("Edit failed to preserve the item identity or unrelated fields.");
  } else if (step.remove) {
    if (items.added.length || items.edited.length || items.removed.length !== 1 || items.removed[0]?.data.kind !== step.remove) issues.push("Delete changed extra or incorrect life items.");
  } else if (items.added.length || items.edited.length || items.removed.length) issues.push("Unexpected life-item changes.");
  const tasks = delta(before.tasks, after.tasks);
  if (step.task === "create") {
    if (tasks.added.length !== 1 || tasks.removed.length || tasks.edited.length) issues.push("Task create changed extra records.");
  } else if (step.task === "complete") {
    const edited = tasks.edited[0], old = before.tasks.find(row => row.id === edited?.id);
    if (tasks.added.length || tasks.removed.length || tasks.edited.length !== 1 || !old
      || !isDeepStrictEqual(edited, { ...old, status: "completed" })) issues.push("Task completion changed unrelated fields or records.");
  } else if (tasks.added.length || tasks.removed.length || tasks.edited.length) issues.push("Unexpected task changes.");
  const goals = delta(before.goals, after.goals);
  if (step.goal === "create") {
    if (goals.added.length !== 1 || goals.removed.length || goals.edited.length) issues.push("Goal create changed extra records.");
  } else if (goals.added.length || goals.removed.length || goals.edited.length) issues.push("Unexpected goal changes.");
  for (const key of ["reminders", "profile", "calendar", "busy"] as const) {
    if (!isDeepStrictEqual(workspaceProductState(before)[key], workspaceProductState(after)[key])) issues.push(`Unexpected ${key} changes.`);
  }
  return issues;
}

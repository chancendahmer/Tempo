import { describe, expect, it } from "vitest";
import type { WorkspaceAction } from "../../server/db/repositories/workspace-repository";
import { WorkspaceMutationAttempts } from "./workspace-mutation-attempts";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const newNote = (value: number, title = "Remember this"): Extract<WorkspaceAction, { action: "save" }> => ({ action: "save", id: id(value), version: 0, data: { kind: "note", title, body: "Keep the detail" } });

describe("workspace mutation attempts", () => {
  it("retries a lost create response with the same ID but permits an intentional repeat after success", () => {
    const attempts = new WorkspaceMutationAttempts();
    const stored = new Set<string>();
    const original = attempts.begin(newNote(1));
    stored.add((original.action as ReturnType<typeof newNote>).id); // Server committed; response was lost.
    const retry = attempts.begin(newNote(2));
    expect(retry).toBe(original);
    stored.add((retry.action as ReturnType<typeof newNote>).id);
    expect(stored.size).toBe(1);
    attempts.settle(retry, 200);
    const intentional = attempts.begin(newNote(3));
    expect(intentional).not.toBe(original);
    stored.add((intentional.action as ReturnType<typeof newNote>).id);
    expect(stored.size).toBe(2);
  });

  it.each(["task", "goal"] as const)("retains the %s request ID after uncertainty", action => {
    const attempts = new WorkspaceMutationAttempts();
    const command = action === "task" ? { type: "create_task" as const, title: "Read one chapter" } : { type: "create_goal" as const, title: "Read more books" };
    const original = attempts.begin({ action, requestId: id(1), command } as WorkspaceAction);
    attempts.settle(original, 503);
    const retry = attempts.begin({ action, requestId: id(2), command } as WorkspaceAction);
    expect(retry).toBe(original);
    expect("requestId" in retry.action && retry.action.requestId).toBe(id(1));
  });

  it("canonicalizes object key order but preserves ordered data and original draft snapshots", () => {
    const attempts = new WorkspaceMutationAttempts();
    const input = newNote(1);
    const original = attempts.begin(input);
    input.data.title = "Changed after send";
    expect(original.action).toEqual(newNote(1));
    const reordered: WorkspaceAction = { data: { body: "Keep the detail", title: "Remember this", kind: "note" }, version: 0, id: id(2), action: "save" };
    expect(attempts.begin(reordered)).toBe(original);
    expect(attempts.begin(input)).not.toBe(original);
    const list = attempts.begin({ action: "add_groceries", items: ["milk", "bread"] });
    expect(attempts.begin({ action: "add_groceries", items: ["bread", "milk"] })).not.toBe(list);
  });

  it("never merges edits of distinct existing records or versions", () => {
    const attempts = new WorkspaceMutationAttempts();
    const first = attempts.begin({ ...newNote(1), version: 1 });
    expect(attempts.begin({ ...newNote(2), version: 1 })).not.toBe(first);
    expect(attempts.begin({ ...newNote(1), version: 2 })).not.toBe(first);
    expect(attempts.begin({ ...newNote(1), version: 1 })).toBe(first);
    const removal = attempts.begin({ action: "delete", id: id(1), version: 1 });
    expect(attempts.begin({ action: "delete", id: id(2), version: 1 })).not.toBe(removal);
  });

  it.each([200, 201, 204, 400, 401, 409, 413, 429])("settles a definitive %i response", status => {
    const attempts = new WorkspaceMutationAttempts();
    const original = attempts.begin(newNote(1));
    attempts.settle(original, status);
    expect(attempts.pendingCount).toBe(0);
    expect(attempts.begin(newNote(2))).not.toBe(original);
  });

  it.each([undefined, 0, 100, 500, 502, 503, 504])("retains uncertainty for status %s", status => {
    const attempts = new WorkspaceMutationAttempts();
    const original = attempts.begin(newNote(1));
    attempts.settle(original, status);
    expect(attempts.begin(newNote(2))).toBe(original);
  });

  it("does not let a late response clear a newer identical operation", () => {
    const attempts = new WorkspaceMutationAttempts();
    const original = attempts.begin(newNote(1));
    attempts.settle(original, 200);
    const newer = attempts.begin(newNote(2));
    attempts.settle(original, 200);
    expect(attempts.begin(newNote(3))).toBe(newer);
  });

  it.each([401, 429])("keeps a possibly committed ID when its retry is rejected with %i", status => {
    const attempts = new WorkspaceMutationAttempts();
    const committed = attempts.begin(newNote(1));
    // The server committed this ID, but fetch or JSON decoding failed before
    // settle ran. The next request is rejected before server receipt lookup.
    const retry = attempts.begin(newNote(2));
    attempts.settle(retry, status);
    expect(attempts.begin(newNote(3))).toBe(committed);
    expect(attempts.pendingCount).toBe(1);
    attempts.settle(committed, 200);
    expect(attempts.begin(newNote(4))).not.toBe(committed);
  });

  it("does not let a client rejection erase an explicitly uncertain server response", () => {
    const attempts = new WorkspaceMutationAttempts();
    const original = attempts.begin(newNote(1));
    attempts.settle(original, 503);
    attempts.settle(original, 409);
    expect(attempts.begin(newNote(2))).toBe(original);
  });

  it("bounds pending memory without evicting any uncertain operation", () => {
    const attempts = new WorkspaceMutationAttempts(2);
    const first = attempts.begin(newNote(1, "First"));
    const second = attempts.begin(newNote(2, "Second"));
    expect(() => attempts.begin(newNote(3, "Third"))).toThrow(/retry a previous change/);
    expect(attempts.begin(newNote(4, "First"))).toBe(first);
    attempts.settle(first, 400);
    expect(() => attempts.begin(newNote(3, "Third"))).toThrow(/retry a previous change/);
    attempts.settle(first, 200);
    expect(attempts.begin(newNote(3, "Third"))).toBeDefined();
    expect(attempts.begin(newNote(5, "Second"))).toBe(second);
    expect(attempts.pendingCount).toBe(2);
  });
});

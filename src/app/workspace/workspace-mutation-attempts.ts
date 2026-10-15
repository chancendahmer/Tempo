import type { WorkspaceAction } from "../../server/db/repositories/workspace-repository";

export type WorkspaceMutationAttempt = { readonly action: WorkspaceAction };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function fingerprint(action: WorkspaceAction) {
  const freshSave = action.action === "save" && action.version === 0;
  const content = Object.fromEntries(Object.entries(action)
    .filter(([key]) => key !== "requestId" && !(freshSave && key === "id")));
  return JSON.stringify(canonical(content));
}

/** One tracker per mounted account view. Unknown responses retain their original
 * operation identity; only a definitive response permits an intentional repeat.
 * This is in-memory retry protection, not an offline queue or reload recovery. */
export class WorkspaceMutationAttempts {
  private readonly pending = new Map<string, WorkspaceMutationAttempt>();
  private readonly keys = new WeakMap<WorkspaceMutationAttempt, string>();
  private readonly uncertain = new WeakSet<WorkspaceMutationAttempt>();

  constructor(private readonly capacity = 32) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("Mutation attempt capacity must be a positive integer.");
  }

  get pendingCount() { return this.pending.size; }

  begin(action: WorkspaceAction): WorkspaceMutationAttempt {
    const key = fingerprint(action);
    const existing = this.pending.get(key);
    if (existing) {
      // The prior invocation never settled. Even a later auth/rate-limit
      // rejection cannot prove that its earlier write did not commit.
      this.uncertain.add(existing);
      return existing;
    }
    if (this.pending.size >= this.capacity) {
      throw new Error("Several changes still need confirmation. Reconnect and retry a previous change before adding another.");
    }
    // Keep the sent payload stable if a form subsequently edits its draft.
    const attempt = { action: JSON.parse(JSON.stringify(action)) as WorkspaceAction };
    this.pending.set(key, attempt);
    this.keys.set(attempt, key);
    return attempt;
  }

  /** A first explicit client rejection settles safely. Once any response is
   * uncertain, only a successful receipt can rule out a prior committed write. */
  settle(attempt: WorkspaceMutationAttempt, status?: number) {
    if (status === undefined || !Number.isInteger(status) || status < 200 || status >= 500) {
      this.uncertain.add(attempt);
      return;
    }
    if (status >= 300 && this.uncertain.has(attempt)) return;
    const key = this.keys.get(attempt);
    // A late response for a settled operation cannot clear a newer identical one.
    if (key !== undefined && this.pending.get(key) === attempt) this.pending.delete(key);
  }
}

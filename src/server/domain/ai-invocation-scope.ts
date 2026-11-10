import { AsyncLocalStorage } from "node:async_hooks";

/** Trusted server metadata only; never serialize this scope into model input. */
export type AiInvocationScope = { accountId: string; executionId: string; signal?: AbortSignal };
const scopes = new AsyncLocalStorage<Readonly<AiInvocationScope>>();

export function withAiInvocationScope<T>(scope: AiInvocationScope, operation: () => Promise<T>): Promise<T> {
  return scopes.run(Object.freeze({ ...scope }), operation);
}

export function currentAiInvocationScope(): Readonly<AiInvocationScope> | undefined {
  return scopes.getStore();
}

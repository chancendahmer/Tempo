import { AsyncLocalStorage } from "node:async_hooks";

export class InboundOwnershipLostError extends Error {
  constructor() { super("Inbound processing ownership was lost or cancelled"); }
}

type Execution = { run<T>(operation: () => Promise<T>): Promise<T> };
const execution = new AsyncLocalStorage<Execution>();

export function inOwnedExecution<T>(owner: Execution, operation: () => Promise<T>) {
  return execution.run(owner, operation);
}

/** Every service call is fenced, including non-model onboarding/pending paths. */
export function ownedService<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== "function") return value;
      if (["claimInbound", "releaseInbound", "markProcessed", "persistReply", "withOwnership"].includes(String(property))) return value.bind(target);
      return (...args: unknown[]) => {
        const owner = execution.getStore();
        const operation = () => value.apply(target, args);
        return owner ? owner.run(operation) : operation();
      };
    },
  });
}

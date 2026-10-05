import { AsyncLocalStorage } from "node:async_hooks";
import type { TempoDatabase } from "./client";

const scope = new AsyncLocalStorage<{ root: TempoDatabase; transaction: TempoDatabase }>();
const roots = new WeakMap<object, TempoDatabase>();
const proxies = new WeakMap<object, TempoDatabase>();

/** Repositories keep this facade so an owned operation uses one transaction. */
export function scopedDatabase(database: TempoDatabase): TempoDatabase {
  if (roots.has(database)) return database;
  const existing = proxies.get(database);
  if (existing) return existing;
  const proxy = new Proxy(database, {
    get(target, property) {
      const current = scope.getStore();
      const selected = current?.root === target ? current.transaction : target;
      const value = Reflect.get(selected, property);
      return typeof value === "function" ? value.bind(selected) : value;
    },
  });
  roots.set(proxy, database);
  proxies.set(database, proxy);
  return proxy;
}

export function inDatabaseTransaction<T>(database: TempoDatabase, transaction: TempoDatabase, operation: () => Promise<T>) {
  return scope.run({ root: roots.get(database) ?? database, transaction }, operation);
}

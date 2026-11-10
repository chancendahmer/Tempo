"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AccountResource<T> = { owner: string; data: T | null; error: boolean; unauthorized: boolean };

/** A failed refresh may retain only a previously verified owner's projection. */
export function resourceFailure<T>(current: AccountResource<T> | null, owner: string, unauthorized: boolean): AccountResource<T> {
  return { owner, data: !unauthorized && current?.owner === owner ? current.data : null, error: !unauthorized, unauthorized };
}
export function visibleResource<T>(current: AccountResource<T> | null, owner: string | null | undefined) {
  return owner && current?.owner === owner ? current : null;
}
export function resourceSuccess<T extends { cacheKey: string }>(data: T, owner: string): AccountResource<T> {
  return { owner, data: data.cacheKey === owner ? data : null, error: data.cacheKey !== owner, unauthorized: false };
}

export function useAccountResource<T extends { cacheKey: string }>(url: string, owner: string | null | undefined, pollMs = 0) {
  const [resource, setResource] = useState<AccountResource<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!owner) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setResource(current => resourceFailure(current, owner, response.status === 401 || response.status === 403));
        return;
      }
      const data = await response.json() as T;
      if (!controller.signal.aborted) setResource(resourceSuccess(data, owner));
    } catch {
      if (!controller.signal.aborted) setResource(current => resourceFailure(current, owner, false));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [owner, url]);

  useEffect(() => {
    if (!owner) return;
    const initial = window.setTimeout(refresh, 0);
    const interval = pollMs > 0 ? window.setInterval(refresh, pollMs) : undefined;
    return () => {
      request.current?.abort();
      window.clearTimeout(initial);
      if (interval) window.clearInterval(interval);
    };
  }, [owner, pollMs, refresh]);

  const visible = visibleResource(resource, owner);
  return { data: visible?.data ?? null, unavailable: visible?.error ?? false, unauthorized: visible?.unauthorized ?? false,
    loading: Boolean(owner) && (!visible || loading), refresh };
}

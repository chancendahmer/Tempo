"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ACCOUNT_EVENT = "tempo-account-change";

export type PublicAccount = {
  displayName: string | null;
  phoneLast4: string;
  phoneVerified: boolean;
  onboardingState: string;
  profileInstructions: string | null;
  profileComplete: boolean;
  calendarStatus: "active" | "requires_reauth" | "disconnected" | null;
};

export function useAccountStatus(pollMs = 0, enabled = true) {
  const [account, setAccount] = useState<PublicAccount | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const suspended = useRef(!enabled);
  const suspend = useCallback(() => {
    suspended.current = true;
    request.current?.abort();
    setAccount(null);
    setError(null);
  }, []);
  const refresh = useCallback(async () => {
    if (suspended.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/account/me", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setAccount(null);
        setError(null);
        return;
      }
      if (!response.ok) throw new Error("Account service unavailable");
      const payload = (await response.json()) as { account?: PublicAccount | null };
      if (controller.signal.aborted) return;
      setAccount(payload.account ?? null);
      setError(null);
    } catch {
      if (controller.signal.aborted) return;
      setAccount((current) => current ?? null);
      setError("We couldn’t load your account. Please try again.");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    suspended.current = false;
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener(ACCOUNT_EVENT, refresh);
    const interval = pollMs > 0 ? window.setInterval(refresh, pollMs) : undefined;
    return () => {
      suspended.current = true;
      request.current?.abort();
      window.clearTimeout(initial);
      window.removeEventListener(ACCOUNT_EVENT, refresh);
      if (interval) window.clearInterval(interval);
    };
  }, [enabled, pollMs, refresh]);

  return { account, refresh, error, suspend };
}

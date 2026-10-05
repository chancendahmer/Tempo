"use client";

import { useCallback, useEffect, useState } from "react";

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

export function useAccountStatus(pollMs = 0) {
  const [account, setAccount] = useState<PublicAccount | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account/me", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setAccount(null);
        setError(null);
        return;
      }
      if (!response.ok) throw new Error("Account service unavailable");
      const payload = (await response.json()) as { account?: PublicAccount | null };
      setAccount(payload.account ?? null);
      setError(null);
    } catch {
      setAccount((current) => current ?? null);
      setError("We couldn’t load your account. Please try again.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener(ACCOUNT_EVENT, refresh);
    const interval = pollMs > 0 ? window.setInterval(refresh, pollMs) : undefined;
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener(ACCOUNT_EVENT, refresh);
      if (interval) window.clearInterval(interval);
    };
  }, [pollMs, refresh]);

  return { account, refresh, error };
}

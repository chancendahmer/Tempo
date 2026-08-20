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
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account/me", { cache: "no-store" });
      const payload = (await response.json()) as { account?: PublicAccount | null };
      setAccount(response.ok ? payload.account ?? null : null);
    } catch {
      setAccount((current) => current ?? null);
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

  return { account, refresh };
}

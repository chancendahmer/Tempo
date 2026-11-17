"use client";

import { useEffect, useState } from "react";

export function EarlyAccessCounter() {
  const [target, setTarget] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/early-access", { cache: "no-store" });
        const payload = (await response.json()) as { count?: number };
        if (active && response.ok && Number.isInteger(payload.count) && payload.count! >= 0) setTarget(payload.count!);
      } catch {
        // The counter is decorative; signup remains available if aggregate loading fails.
      }
    };
    void load();
    window.addEventListener("tempo-signup-change", load);
    return () => {
      active = false;
      window.removeEventListener("tempo-signup-change", load);
    };
  }, []);

  if (!target) return null;

  return (
    <div
      className="interest-counter"
      aria-label={`${target} ${target === 1 ? "person has" : "people have"} joined Tempo early access`}
    >
      <span className="counter-number" aria-hidden="true">{target}</span>
      <span className="counter-caption" aria-hidden="true">early<br />members</span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export function EarlyAccessCounter() {
  const [target, setTarget] = useState(0);
  const [count, setCount] = useState(0);

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

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const frame = window.requestAnimationFrame(() => setCount(target));
      return () => window.cancelAnimationFrame(frame);
    }

    const startedAt = performance.now();
    const initial = count;
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / 900, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(initial + (target - initial) * eased));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
    // The animation deliberately restarts only when the server-backed target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div
      className="interest-counter"
      aria-label={`${target} ${target === 1 ? "person has" : "people have"} joined Tempo early access`}
    >
      <span className="counter-number" aria-hidden="true">{count}</span>
      <span className="counter-caption" aria-hidden="true">early<br />members</span>
    </div>
  );
}

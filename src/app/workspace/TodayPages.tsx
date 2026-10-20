"use client";
import { useRef, useState, type ReactNode } from "react";
import { FiArrowLeft, FiArrowRight, FiCompass } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import { JourneyView } from "./JourneyView";
import { journeySwipe } from "./journey-model";
import s from "./journey.module.css";

export function TodayPages({ children, data, now, preview, onSetup, motion, setMotion }: { children: ReactNode; data: Workspace; now: Date; preview: boolean; onSetup: () => void; motion: boolean; setMotion: (value: boolean) => void }) {
  const [page, setPage] = useState<"today" | "journey">("today");
  const region = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  function change(next: typeof page) {
    if (next === page) return;
    setPage(next);
    requestAnimationFrame(() => {
      region.current?.focus({ preventScroll: true });
      region.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  return <div ref={region} tabIndex={-1} className={s.pages} role="region" aria-label={page === "today" ? "Today, page 1 of 2" : "Your journey, page 2 of 2"}
    onTouchStart={event => { const target = event.target as HTMLElement; touch.current = event.touches.length === 1 && !target.closest("button,a,input,textarea,select,summary,[data-no-swipe]") ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
    onTouchCancel={() => { touch.current = null; }}
    onTouchEnd={event => { if (touch.current && event.changedTouches[0]) { const next = journeySwipe(touch.current, { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }); if (next) change(next); } touch.current = null; }}>
    <nav className={s.pageNav} aria-label="Today pages">
      <button onClick={() => change("today")} aria-current={page === "today" ? "page" : undefined}>{page === "journey" && <FiArrowLeft />}Today <span>01</span></button>
      <span className={s.navLine} />
      <button onClick={() => change("journey")} aria-current={page === "journey" ? "page" : undefined}><FiCompass />Your journey <span>02</span>{page === "today" && <FiArrowRight />}</button>
    </nav>
    {page === "today" ? children : <JourneyView data={data} now={now} preview={preview} onBack={() => change("today")} onSetup={onSetup} motion={motion} setMotion={setMotion} />}
  </div>;
}

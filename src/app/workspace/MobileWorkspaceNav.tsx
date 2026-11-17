"use client";

import { useEffect, useState } from "react";
import { FiCalendar, FiCheckSquare, FiGrid, FiHome } from "react-icons/fi";
import type { Section } from "./WorkspaceNavigation";
import s from "./mobile-workspace-nav.module.css";

const destinations = [
  ["today", "Today", FiHome],
  ["tasks", "To-do", FiCheckSquare],
  ["calendar", "Calendar", FiCalendar],
] as const;

export function MobileWorkspaceNav({ current, expanded, go, openSpaces }: {
  current: Section; expanded: boolean; go: (section: Section) => void;
  openSpaces: (opener: HTMLButtonElement) => void;
}) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const editing = document.activeElement?.matches("input, textarea, [contenteditable=true]");
      setKeyboardOpen(Boolean(editing && viewport.scale === 1 && window.innerHeight - viewport.height > 120));
    };
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return <nav className={s.nav} aria-label="Quick navigation" data-mobile-navigation data-keyboard-open={keyboardOpen}>
    {destinations.map(([section, label, Icon]) => <button key={section} type="button" aria-current={current === section ? "page" : undefined} onClick={() => go(section)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    <button type="button" data-tour-anchor="spaces" aria-expanded={expanded} aria-controls="workspace-navigation" onClick={event => openSpaces(event.currentTarget)}><FiGrid aria-hidden="true" /><span>Spaces</span></button>
  </nav>;
}

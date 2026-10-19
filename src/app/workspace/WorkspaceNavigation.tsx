import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FiBookOpen, FiCalendar, FiCheckCircle, FiChevronRight, FiClock, FiCoffee, FiHeart, FiHome, FiInbox, FiMessageCircle, FiSettings, FiShoppingBag, FiSun, FiTarget, FiZap } from "react-icons/fi";
import s from "./navigation.module.css";

// Stable destinations keep existing links working, including links from SMS.
export const sections = [
  ["today", "Today", FiHome, "coral"], ["tasks", "To-do", FiCheckCircle, "orange"],
  ["calendar", "Calendar", FiCalendar, "blue"], ["goals", "Goals", FiTarget, "sage"],
  ["reminders", "Reminders", FiClock, "amber"], ["routines", "Routines", FiSun, "amber"],
  ["wake", "Sunrise & sunset", FiSun, "lavender"], ["meals", "Meal plan", FiCoffee, "orange"],
  ["recipes", "Recipes", FiBookOpen, "amber"], ["groceries", "Groceries", FiShoppingBag, "sage"],
  ["nutrition", "Nutrition Tracker", FiHeart, "blue"], ["movement", "Fitness", FiZap, "teal"],
  ["inbox", "Thoughts", FiInbox, "amber"], ["memories", "Memories", FiBookOpen, "lavender"],
  ["assistant", "Ask Tempo", FiMessageCircle, "rose"], ["settings", "Settings", FiSettings, "blue"],
] as const;
export type Section = typeof sections[number][0];
export const navigationGroups: { id: string; label: string; icon: typeof FiCalendar; tone: typeof sections[number][3]; sections: Section[] }[] = [
  { id: "planner", label: "Planner", icon: FiCalendar, tone: "blue", sections: ["tasks", "calendar", "goals", "reminders"] },
  { id: "rhythm", label: "Daily rhythm", icon: FiSun, tone: "amber", sections: ["routines", "wake"] },
  { id: "food", label: "Food & fitness", icon: FiHeart, tone: "teal", sections: ["meals", "recipes", "groceries", "nutrition", "movement"] },
  { id: "brain", label: "Brain dump", icon: FiInbox, tone: "lavender", sections: ["inbox", "memories"] },
];
export function groupForSection(section: Section) {
  return navigationGroups.find(group => group.sections.includes(section));
}

function Destination({ destination, current, go }: { destination: Section; current: Section; go: (section: Section) => void }) {
  const [key, label, Icon, tone] = sections.find(([key]) => key === destination)!;
  return <button type="button" data-tone={tone} aria-current={current === key ? "page" : undefined} onClick={() => go(key)}>
    <span className={s.icon} aria-hidden="true"><Icon /></span><span>{label}</span>
  </button>;
}

export function WorkspaceSidebarNav({ current, go }: { current: Section; go: (section: Section) => void }) {
  const rail = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState<{ id: string; top: number; left: number; pinned: boolean; focusFirst: boolean } | null>(null);
  const clearOpenTimer = () => { if (openTimer.current) clearTimeout(openTimer.current); };
  const clearCloseTimer = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const close = () => { clearOpenTimer(); clearCloseTimer(); setOpen(null); };
  const navigate = (section: Section) => {
    if (open) document.getElementById(`nav-${open.id}`)?.focus();
    close(); go(section);
  };
  const show = (group: typeof navigationGroups[number], pinned = false, focusFirst = false) => {
    clearOpenTimer();
    clearCloseTimer();
    const trigger = document.getElementById(`nav-${group.id}`);
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Fixed positioning escapes the scrollable rail; small screens use an inline disclosure.
    const height = Math.min(group.sections.length * 52 + 76, window.innerHeight - 24);
    setOpen({ id: group.id, top: Math.max(12, Math.min(rect.top, window.innerHeight - height - 12)), left: rect.right + 12, pinned, focusFirst });
  };

  useLayoutEffect(() => {
    if (open?.focusFirst) panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);

  const openId = open?.id;
  useEffect(() => {
    if (!openId) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (rail.current?.contains(document.activeElement)) document.getElementById(`nav-${openId}`)?.focus();
      setOpen(null);
    };
    // A hover-opened panel can be dismissed even while focus stays in the main page.
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [openId]);

  useEffect(() => {
    const dismiss = () => { if (openTimer.current) clearTimeout(openTimer.current); if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(null); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rail.current?.contains(event.target)) dismiss();
    };
    // Back/forward navigation and a breakpoint change must not leave a stale flyout.
    window.addEventListener("hashchange", dismiss);
    window.addEventListener("resize", dismiss);
    document.addEventListener("pointerdown", outside);
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      window.removeEventListener("hashchange", dismiss);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);

  return <nav ref={rail} className={s.rail} aria-label="Your workspace" onScroll={event => {
    if (event.target === rail.current && window.matchMedia("(min-width:761px)").matches) close();
  }}>
    <div className={s.shortcuts}><Destination destination="today" current={current} go={navigate} /><Destination destination="assistant" current={current} go={navigate} /></div>
    <div className={s.groups}><div className={s.groupLabel}>Your space</div>{navigationGroups.map(group => {
      const { icon: Icon, tone } = group;
      const expanded = open?.id === group.id;
      const active = group.sections.includes(current);
      return <section key={group.id} className={s.group} onPointerEnter={event => {
        if (event.pointerType === "mouse" && window.matchMedia("(min-width:761px)").matches) {
          clearCloseTimer();
          // A brief intent delay avoids opening every group while crossing the rail.
          if (!expanded) { clearOpenTimer(); openTimer.current = setTimeout(() => show(group), 140); }
        }
      }} onPointerLeave={event => {
        clearOpenTimer();
        if (!expanded || open.pinned || event.currentTarget.contains(document.activeElement)) return;
        // Give the pointer time to cross the small gap between the rail and flyout.
        closeTimer.current = setTimeout(() => setOpen(null), 250);
      }} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}>
        <button id={`nav-${group.id}`} type="button" className={s.groupButton} data-tone={tone} data-active={active || undefined}
          aria-expanded={expanded} aria-controls={`nav-panel-${group.id}`}
          onClick={() => expanded && open.pinned ? close() : show(group, true)}
          onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); show(group, true, true); }
          }}>
          <span className={s.icon} aria-hidden="true"><Icon /></span><span>{group.label}</span><FiChevronRight className={s.chevron} aria-hidden="true" />
        </button>
        <div ref={expanded ? panel : undefined} hidden={!expanded} id={`nav-panel-${group.id}`} className={s.flyout} style={{ top: open?.top ?? 0, left: open?.left ?? 0 }} aria-labelledby={`nav-${group.id}`} onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}>
          <div className={s.flyoutHeading}>{group.label}</div>
          <div className={s.destinations}>{group.sections.map(key => <Destination key={key} destination={key} current={current} go={navigate} />)}</div>
        </div>
      </section>;
    })}</div>
  </nav>;
}

export function WorkspaceSectionNav({ current, go }: { current: Section; go: (section: Section) => void }) {
  const tabs = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = tabs.current;
    const selected = nav?.querySelector<HTMLButtonElement>("[aria-current=page]");
    if (!nav || !selected || nav.scrollWidth <= nav.clientWidth) return;
    // Only scroll the horizontal strip, never the page or the user's reading position.
    const offset = selected.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollLeft = Math.max(0, offset - (nav.clientWidth - selected.offsetWidth) / 2);
  }, [current]);
  const group = groupForSection(current);
  if (!group) return null;
  return <nav ref={tabs} className={s.tabs} aria-label={`${group.label} sections`}>
    {group.sections.map(key => <Destination key={key} destination={key} current={current} go={go} />)}
  </nav>;
}

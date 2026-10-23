import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LuAlarmClock, LuBookOpen, LuCalendarDays, LuChartPie, LuChevronRight, LuDumbbell, LuHouse, LuLayers, LuListTodo, LuMessageCircle, LuNotebookPen, LuSettings2, LuShoppingBasket, LuSun, LuSunMoon, LuTarget, LuUtensils } from "react-icons/lu";
import s from "./navigation.module.css";

// Stable destinations keep existing links working, including links from SMS.
export const sections = [
  ["today", "Today", LuHouse, "coral"], ["tasks", "To-do", LuListTodo, "orange"],
  ["calendar", "Calendar", LuCalendarDays, "blue"], ["goals", "Goals", LuTarget, "sage"],
  ["reminders", "Reminders", LuAlarmClock, "amber"], ["routines", "Routines", LuSun, "amber"],
  ["wake", "Sunrise & sunset", LuSunMoon, "lavender"], ["meals", "Meal plan", LuUtensils, "orange"],
  ["recipes", "Recipes", LuBookOpen, "amber"], ["groceries", "Groceries", LuShoppingBasket, "sage"],
  ["nutrition", "Nutrition Tracker", LuChartPie, "blue"], ["movement", "Fitness", LuDumbbell, "teal"],
  ["inbox", "Thoughts", LuNotebookPen, "amber"], ["memories", "Memories", LuLayers, "lavender"],
  ["assistant", "Ask Tempo", LuMessageCircle, "lavender"], ["settings", "Settings", LuSettings2, "blue"],
] as const;
export type Section = typeof sections[number][0];
export const navigationGroups: { id: string; label: string; description: string; icon: typeof LuCalendarDays; tone: typeof sections[number][3]; sections: Section[] }[] = [
  { id: "planner", label: "Planner", description: "To-dos, calendar & goals", icon: LuCalendarDays, tone: "orange", sections: ["tasks", "calendar", "goals", "reminders"] },
  { id: "rhythm", label: "Daily rhythm", description: "Routines & wind-down", icon: LuSunMoon, tone: "amber", sections: ["routines", "wake"] },
  { id: "food", label: "Food & fitness", description: "Meals, nutrition & movement", icon: LuUtensils, tone: "teal", sections: ["meals", "recipes", "groceries", "nutrition", "movement"] },
  { id: "brain", label: "Brain dump", description: "Thoughts & memories", icon: LuNotebookPen, tone: "lavender", sections: ["inbox", "memories"] },
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

export function WorkspaceSidebarNav({ current, go, initialGroup }: { current: Section; go: (section: Section) => void; initialGroup?: string }) {
  const [open, setOpen] = useState<string | null>(initialGroup ?? groupForSection(current)?.id ?? null);
  const panel = useRef<HTMLDivElement>(null);
  const focusFirst = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const clearHover = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  useLayoutEffect(() => {
    if (focusFirst.current) { panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); focusFirst.current = false; }
  }, [open]);

  return <nav className={s.rail} aria-label="Your workspace">
    <div className={s.shortcuts}><Destination destination="today" current={current} go={go} /><Destination destination="assistant" current={current} go={go} /></div>
    <div className={s.groups}><div className={s.groupLabel}>Your apps</div>{navigationGroups.map(group => {
      const Icon = group.icon;
      const expanded = open === group.id;
      return <section key={group.id} className={s.group} onPointerEnter={event => {
        if (event.pointerType !== "mouse" || pinned.current || !window.matchMedia("(min-width:761px)").matches) return;
        clearHover(); hoverTimer.current = setTimeout(() => setOpen(group.id), 220);
      }} onPointerLeave={clearHover}>
        <button id={`nav-${group.id}`} type="button" className={s.groupButton} data-tone={group.tone} data-active={group.sections.includes(current) || undefined}
          aria-expanded={expanded} aria-controls={`nav-panel-${group.id}`}
          onClick={() => { clearHover(); pinned.current = true; setOpen(expanded ? null : group.id); }}
          onKeyDown={event => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowRight") return;
            event.preventDefault(); pinned.current = true;
            if (expanded) panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
            else { focusFirst.current = true; setOpen(group.id); }
          }}>
          <span className={s.icon} aria-hidden="true"><Icon /></span><span>{group.label}</span><LuChevronRight className={s.chevron} aria-hidden="true" />
        </button>
        <div ref={expanded ? panel : undefined} hidden={!expanded} id={`nav-panel-${group.id}`} className={s.flyout} aria-labelledby={`nav-${group.id}`} onKeyDown={event => {
          if (event.key === "ArrowLeft") { event.preventDefault(); setOpen(null); document.getElementById(`nav-${group.id}`)?.focus(); return; }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }}>
          <div className={s.destinations}>{group.sections.map(key => <Destination key={key} destination={key} current={current} go={go} />)}</div>
        </div>
      </section>;
    })}</div>
  </nav>;
}

/** A secondary route into the same navigation, without a hidden swipe-only page. */
export function WorkspaceAppLauncher({ openGroup }: { openGroup: (group: string) => void }) {
  return <section className={s.launcher} aria-labelledby="apps-heading">
    <div className={s.launcherHeading}><h2 id="apps-heading">Your apps</h2><span>Everything has a place.</span></div>
    <div className={s.launcherGrid}>{navigationGroups.map(group => {
      const Icon = group.icon;
      return <button type="button" key={group.id} data-tone={group.tone} onClick={() => openGroup(group.id)} aria-label={`Open ${group.label} apps`}>
        <Icon className={s.launcherIcon} aria-hidden="true" /><span><strong>{group.label}</strong><small>{group.description}</small></span><LuChevronRight className={s.chevron} aria-hidden="true" />
      </button>;
    })}</div>
  </section>;
}

export function WorkspaceSectionNav({ current, go }: { current: Section; go: (section: Section) => void }) {
  const tabs = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = tabs.current;
    const selected = nav?.querySelector<HTMLButtonElement>("[aria-current=page]");
    if (!nav || !selected) return;
    const revealSelected = () => {
      if (nav.scrollWidth <= nav.clientWidth) return;
      // Only scroll the strip, including on rotation; never move the page itself.
      const offset = selected.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      nav.scrollLeft = Math.max(0, offset - (nav.clientWidth - selected.offsetWidth) / 2);
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [current]);
  const group = groupForSection(current);
  if (!group) return null;
  return <nav ref={tabs} className={s.tabs} aria-label={`${group.label} sections`}>
    {group.sections.map(key => <Destination key={key} destination={key} current={current} go={go} />)}
  </nav>;
}

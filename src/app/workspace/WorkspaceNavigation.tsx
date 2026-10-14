import { FiBookOpen, FiCalendar, FiCheckCircle, FiClock, FiCoffee, FiHeart, FiHome, FiInbox, FiMessageCircle, FiSettings, FiShoppingBag, FiSun, FiTarget, FiZap } from "react-icons/fi";
import s from "./navigation.module.css";

// Stable destinations keep existing links working, including links from SMS.
export const sections = [
  ["today", "Today", FiHome, "orange"], ["tasks", "To-do", FiCheckCircle, "orange"],
  ["calendar", "Calendar", FiCalendar, "blue"], ["goals", "Goals", FiTarget, "sage"],
  ["reminders", "Reminders", FiClock, "amber"], ["routines", "Routines", FiSun, "amber"],
  ["wake", "Sunrise & sunset", FiSun, "lavender"], ["meals", "Meal plan", FiCoffee, "orange"],
  ["recipes", "Recipes", FiBookOpen, "amber"], ["groceries", "Groceries", FiShoppingBag, "sage"],
  ["nutrition", "Food log", FiHeart, "rose"], ["movement", "Fitness", FiZap, "teal"],
  ["inbox", "Thoughts", FiInbox, "amber"], ["memories", "Memories", FiBookOpen, "lavender"],
  ["assistant", "Ask Tempo", FiMessageCircle, "lavender"], ["settings", "Settings", FiSettings, "blue"],
] as const;
export type Section = typeof sections[number][0];
export const navigationGroups: { id: string; label: string; sections: Section[] }[] = [
  { id: "planner", label: "Planner", sections: ["tasks", "calendar", "goals", "reminders"] },
  { id: "rhythm", label: "Daily rhythm", sections: ["routines", "wake"] },
  { id: "food", label: "Food & fitness", sections: ["meals", "recipes", "groceries", "nutrition", "movement"] },
  { id: "brain", label: "Brain dump", sections: ["inbox", "memories"] },
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
  return <nav className={s.rail} aria-label="Your workspace">
    <div className={s.shortcuts}><Destination destination="today" current={current} go={go} /><Destination destination="assistant" current={current} go={go} /></div>
    {navigationGroups.map(group => <section key={group.id} aria-labelledby={`nav-${group.id}`}>
      <h2 id={`nav-${group.id}`}>{group.label}</h2>
      <div className={s.destinations}>{group.sections.map(key => <Destination key={key} destination={key} current={current} go={go} />)}</div>
    </section>)}
  </nav>;
}

export function WorkspaceSectionNav({ current, go }: { current: Section; go: (section: Section) => void }) {
  const group = groupForSection(current);
  if (!group) return null;
  return <nav className={s.tabs} aria-label={`${group.label} sections`}>
    {group.sections.map(key => <Destination key={key} destination={key} current={current} go={go} />)}
  </nav>;
}

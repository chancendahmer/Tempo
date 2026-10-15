import { FiBookOpen, FiCalendar, FiCheckCircle, FiClock, FiCoffee, FiHeart, FiInbox, FiMessageCircle, FiMoon, FiSettings, FiShoppingBag, FiSun, FiTarget, FiZap } from "react-icons/fi";
import s from "./workspace.module.css";

/** Decorative wayfinding, never a substitute for a section's text label. */
export function SectionArt({ section }: { section: string }) {
  const Icon = ({ tasks: FiCheckCircle, goals: FiTarget, memories: FiBookOpen, reminders: FiClock, wake: FiSun, calendar: FiCalendar, routines: FiSun, meals: FiCoffee, recipes: FiBookOpen, groceries: FiShoppingBag, nutrition: FiHeart, movement: FiZap, inbox: FiInbox, assistant: FiMessageCircle, settings: FiSettings, FiShoppingBag, evening: FiMoon } as Record<string, typeof FiSun>)[section] ?? FiSun;
  return <div className={s.sectionArt} aria-hidden="true"><Icon /></div>;
}

export function MealIllustration({ meal }: { meal: string }) {
  const Icon = meal === "Breakfast" ? FiCoffee : meal === "Dinner" ? FiMoon : meal === "Lunch" ? FiSun : FiHeart;
  return <Icon aria-hidden="true" />;
}

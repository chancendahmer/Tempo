import { FiCoffee, FiHeart, FiMoon, FiSun } from "react-icons/fi";
import { sections } from "./WorkspaceNavigation";
import s from "./workspace.module.css";

/** Decorative wayfinding, never a substitute for a section's text label. */
export function SectionArt({ section }: { section: string }) {
  const Icon = sections.find(([key]) => key === section)?.[2] ?? FiSun;
  return <div className={s.sectionArt} aria-hidden="true"><Icon /></div>;
}

export function MealIllustration({ meal }: { meal: string }) {
  const Icon = meal === "Breakfast" ? FiCoffee : meal === "Dinner" ? FiMoon : meal === "Lunch" ? FiSun : FiHeart;
  return <Icon aria-hidden="true" />;
}

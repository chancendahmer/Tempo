import { FiCalendar, FiCoffee, FiHeart, FiInbox, FiMessageCircle, FiMoon, FiSettings, FiSun, FiZap } from "react-icons/fi";
import s from "./workspace.module.css";

/** Decorative wayfinding, never a substitute for a section's text label. */
export function SectionArt({ section }: { section: string }) {
  const Icon = ({ wake: FiSun, calendar: FiCalendar, routines: FiSun, meals: FiCoffee, nutrition: FiHeart, movement: FiZap, inbox: FiInbox, assistant: FiMessageCircle, settings: FiSettings, evening: FiMoon } as Record<string, typeof FiSun>)[section] ?? FiSun;
  return <div className={s.sectionArt} aria-hidden="true"><span className={s.artOrbit} /><span className={s.artTile}><Icon /></span><span className={s.artDot} /><span className={s.artDash} /></div>;
}

export function MealIllustration({ meal }: { meal: string }) {
  return <svg className={s.plateArt} viewBox="0 0 180 110" aria-hidden="true">
    <ellipse cx="90" cy="99" rx="55" ry="6" fill="currentColor" opacity=".08" />
    <circle cx="90" cy="53" r="46" fill="white" opacity=".8" />
    <circle cx="90" cy="53" r="35" fill="none" stroke="currentColor" opacity=".18" strokeWidth="2" />
    {meal === "Breakfast" ? <><rect x="65" y="30" width="45" height="47" rx="12" fill="#d5a86e" transform="rotate(-12 90 53)" /><path d="M69 39Q88 26 107 44Q115 64 93 69Q65 78 69 39" fill="#fff7dd" /><circle cx="88" cy="49" r="11" fill="#eabd5b" /></> : meal === "Snack" ? <><path d="M88 38C53 19 56 80 81 82Q90 76 98 82C124 79 128 22 93 38" fill="#cf816a" /><path d="M90 38Q86 24 94 19" stroke="#7c6650" fill="none" strokeWidth="4" /><path d="M94 28Q116 9 117 27Q105 36 94 28" fill="#8ca875" /></> : <><path d="M61 61Q85 82 111 65L106 80H72Z" fill="#dcb778" /><ellipse cx="87" cy="57" rx="23" ry="14" fill="#ebd4a8" /><circle cx="108" cy="38" r="13" fill="#8eaa71" /><circle cx="122" cy="52" r="12" fill="#a4ba82" /><circle cx="105" cy="56" r="10" fill="#729366" /><path d="M61 36l14 12M55 48l17 9" stroke="#dc9970" strokeWidth="9" strokeLinecap="round" /></>}
    <path d="M29 29v48M23 29v15q6 8 12 0V29M150 29v48M150 29q-13 13 0 23" stroke="currentColor" opacity=".45" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>;
}

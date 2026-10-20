"use client";

import { FiArrowRight, FiCheck, FiChevronDown, FiSun, FiTrendingUp } from "react-icons/fi";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import type { Workspace } from "./workspace-data";
import s from "./today.module.css";

export function TodayProgress({ data, preview, onSetup, onAsk }: { data: Workspace; preview: boolean; onSetup: () => void; onAsk: () => void }) {
  const streak = data.activityStreak;
  const showStreak = data.setup?.showStreak !== false && streak;
  const needsSetup = !data.setup || data.setup.setupStatus === "new";
  return <section className={s.companion} aria-label="Your Tempo and progress">
    <div className={s.companionIntro} data-setup={needsSetup}>
      <span className={s.companionAvatar}><WorkspaceAvatar size={58} /></span>
      <div><span className={s.kicker}>{needsSetup ? "A SPACE THAT FITS YOU" : "HERE WITH YOU"}</span><strong>{needsSetup ? "Let’s make Tempo feel like yours." : streak?.activeToday ? "A little progress is still progress." : "One thing at a time."}</strong><p>{needsSetup ? "Your name, your kind of support, your pace." : "Plans can change. We’ll start from here."}</p></div>
      <button className={s.companionAction} onClick={needsSetup ? onSetup : onAsk}>{needsSetup ? "Make it mine" : "Help me get started"}<FiArrowRight aria-hidden="true" /></button>
    </div>
    {showStreak && <details className={s.progressDisclosure}>
      <summary><span className={s.streakMark} aria-hidden="true"><FiTrendingUp /></span><span><strong>{streak.currentDays ? `${streak.currentDays}-day streak` : "Your next small step"}</strong><small>{streak.completedToday ? `${streak.completedToday} ${streak.completedToday === 1 ? "completion" : "completions"} today` : "Every day is a fresh start"}{preview ? " · sample" : ""}</small></span><FiChevronDown className={s.progressChevron} aria-hidden="true" /></summary>
      <div className={s.progressDetails}><h3>Your last seven days</h3><div className={s.progressWeek}>{streak.recentDays.map(day => <div key={day.date} data-active={day.active} title={`${day.date}: ${day.completed} completions`}><small>{new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</small><span>{day.active ? <FiCheck aria-label="Completed activity" /> : <FiSun aria-label="No recorded completion" />}</span><span className={s.progressDate}>{Number(day.date.slice(-2))}</span></div>)}</div><p>Complete a task or routine step to mark a day. You have all of today to continue a streak; a break never erases earlier progress.</p><p>{streak.historyNote}</p><button className={s.companionAction} onClick={onSetup}>Change progress display <FiArrowRight aria-hidden="true" /></button></div>
    </details>}
  </section>;
}

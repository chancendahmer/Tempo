"use client";

import Image from "next/image";
import { FiArrowRight, FiCheck, FiChevronDown, FiPause, FiPlay, FiSun } from "react-icons/fi";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import type { Workspace } from "./workspace-data";
import s from "./today.module.css";

export function TodayProgress({ data, now, preview, onSetup, onAsk, motion, setMotion }: {
  data: Workspace; now: Date; preview: boolean; onSetup: () => void; onAsk: () => void;
  motion: boolean; setMotion: (value: boolean) => void;
}) {
  const streak = data.activityStreak;
  const showStreak = data.setup?.showStreak !== false && streak;
  const needsSetup = !data.setup || data.setup.setupStatus === "new";
  return <header className={s.companion} aria-label="Your day with Tempo" data-motion={motion}>
    <div className={s.welcome}>
      <div className={s.dateLine}>
        <span>{new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric", timeZone: data.timezone }).format(now)}</span>
        <time>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: data.timezone }).format(now)}</time>
      </div>
      <h1>Your {new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: data.timezone }).format(now)}.</h1>
      <p className={s.welcomeLine}>A little structure. A little room to grow.</p>
      <div className={s.companionIntro} data-setup={needsSetup}>
        <span className={s.companionAvatar}><WorkspaceAvatar size={68} /></span>
        <div className={s.tempoNote}>
          <span className={s.kicker}>A LITTLE NOTE FROM TEMPO</span>
          <strong>{needsSetup ? "Let’s make this day feel like yours." : streak?.activeToday ? "You’ve already made a little room for progress." : "You don’t have to do it all. Let’s start with one thing."}</strong>
          <button className={s.companionAction} onClick={needsSetup ? onSetup : onAsk}>{needsSetup ? "Make it mine" : "Help me get started"}<FiArrowRight aria-hidden="true" /></button>
        </div>
      </div>
    </div>
    <div className={s.worldCorner}>
      <Image className={s.garden} src="/images/today-garden.webp" width={1536} height={1024} sizes="(max-width: 700px) 150px, 360px" alt="" loading="eager" />
      <button className={s.motionControl} onClick={() => setMotion(!motion)} aria-pressed={!motion} aria-label={motion ? "Pause Today animations" : "Play Today animations"}>{motion ? <FiPause /> : <FiPlay />}<span>{motion ? "Pause motion" : "Play motion"}</span></button>
    {showStreak && <details className={s.progressDisclosure}>
      <summary><Image className={s.streakMark} src={streak.currentDays ? "/images/journey-flame.webp" : "/images/journey-sprout.webp"} width={48} height={48} alt="" /><span><strong>{streak.currentDays ? `${streak.currentDays}-day streak` : "Your next small step"}</strong><small>{streak.completedToday ? `${streak.completedToday} ${streak.completedToday === 1 ? "completion" : "completions"} today` : "Every day is a fresh start"}{preview ? " · sample" : ""}</small></span><FiChevronDown className={s.progressChevron} aria-hidden="true" /></summary>
      <div className={s.progressDetails}><h3>Your last seven days</h3><div className={s.progressWeek}>{streak.recentDays.map(day => <div key={day.date} data-active={day.active} title={`${day.date}: ${day.completed} completions`}><small>{new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</small><span>{day.active ? <FiCheck aria-label="Completed activity" /> : <FiSun aria-label="No recorded completion" />}</span><span className={s.progressDate}>{Number(day.date.slice(-2))}</span></div>)}</div><p>Complete a task or routine step to mark a day. You have all of today to continue a streak; a break never erases earlier progress.</p><p>{streak.historyNote}</p><button className={s.companionAction} onClick={onSetup}>Change progress display <FiArrowRight aria-hidden="true" /></button></div>
    </details>}
    </div>
  </header>;
}

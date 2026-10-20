"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { FiArrowRight, FiAward, FiCheck, FiCompass, FiFlag, FiHeart, FiMapPin, FiPause, FiPlay, FiStar, FiSun, FiTrendingUp } from "react-icons/fi";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import { dailyEncouragement, journeyProgress, journeyStops } from "./journey-model";
import type { Workspace } from "./workspace-data";
import s from "./journey.module.css";

export function JourneyView({ data, now, preview, onBack, onSetup, motion, setMotion }: { data: Workspace; now: Date; preview: boolean; onBack: () => void; onSetup: () => void; motion: boolean; setMotion: (value: boolean) => void }) {
  const activity = data.activityStreak;
  const progress = journeyProgress(activity?.totalActiveDays ?? 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [celebration, setCelebration] = useState(0);
  const numbersVisible = data.setup?.showStreak !== false;
  const known = typeof activity?.totalActiveDays === "number";
  const stopIndex = selected ?? progress.index;
  const stop = journeyStops[stopIndex];
  const reached = progress.earnedDays >= stop.days;
  const weekday = (date: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return <section className={s.journey} data-motion={motion} aria-labelledby="journey-title">
    <header className={s.heading}><div><span className={s.eyebrow}>YOUR LIFE. YOUR PACE.</span><h1 id="journey-title">Look how far you’ve come.</h1><p>A trail made of little things. Every one counts.</p></div><button className={s.motion} onClick={() => setMotion(!motion)} aria-pressed={!motion} title="Animation choice lasts while this workspace is open. Device reduced-motion settings are always respected.">{motion ? <FiPause /> : <FiPlay />}{motion ? "Pause animations" : "Enable animations"}</button></header>
    <div className={s.journeyLayout}>
      <div className={s.trailColumn}>
        <div className={s.map} data-no-swipe="true" aria-label="Your interactive journey trail">
          <Image src="/images/journey-trail.webp" alt="A winding sunlit trail through green hills, past a blue lake toward the mountains." fill sizes="(max-width: 800px) 100vw, 70vw" loading="eager" className={s.landscape} />
          <div className={s.mapCaption}><FiCompass /><span>THE SMALL STEPS TRAIL</span>{preview && <b>Sample</b>}</div>
          {known && numbersVisible && journeyStops.map((point, index) => <button key={point.name} className={s.stop} style={{ left: `${point.x}%`, top: `${point.y}%` }} data-stop={index} data-high={index >= 4} data-earned={progress.earnedDays >= point.days} data-current={progress.index === index} aria-pressed={stopIndex === index} aria-label={`Level ${index + 1}: ${point.name}. ${point.days === 0 ? "Starting point" : `${point.days} active days. ${progress.earnedDays >= point.days ? "Reached" : `${point.days - progress.earnedDays} more ${point.days - progress.earnedDays === 1 ? "day" : "days"}`}`}`} onClick={() => { setSelected(index); setCelebration(0); }}>
            {index === progress.index && <span className={s.mapAvatar} aria-hidden="true"><WorkspaceAvatar size={50} /></span>}
            <span className={s.stopCircle}>{progress.earnedDays >= point.days && index !== progress.index ? <FiCheck /> : index === progress.index ? <FiMapPin /> : index + 1}</span><span className={s.stopLabel}>{point.name}</span>
          </button>)}
          <span className={s.mapFooter}>{numbersVisible && known ? "Choose a stop to explore" : "A little room to breathe"}<FiArrowRight /></span>
        </div>
        {numbersVisible && known ? <>
          <div className={s.trailProgress}><div className={s.levelMark}><FiAward aria-hidden="true" /><strong>Level {progress.level}</strong></div><div className={s.levelCopy}><strong>{progress.current.name}</strong><p>{progress.next ? `${progress.remaining} more active ${progress.remaining === 1 ? "day" : "days"} to ${progress.next.name}` : "All six stops reached. Your days keep adding up."}</p><progress aria-label="Progress to next journey level" max={100} value={progress.percent} /></div><span className={s.daysEarned}><b>{progress.earnedDays}</b>active days</span></div>
          <div className={s.milestone} aria-live="polite" aria-atomic="true"><span className={s.milestoneIcon}>{reached ? <FiFlag /> : <FiCompass />}</span><div><span className={s.eyebrow}>{stop.days === 0 ? "YOUR STARTING POINT" : reached ? `LEVEL ${stopIndex + 1} · REACHED` : `AHEAD · LEVEL ${stopIndex + 1}`}</span><h2>{stop.name}</h2><p className={s.stopMessage}>{stop.title}</p><p>{reached ? stop.detail : `${stop.days - progress.earnedDays} more active days to reach ${stop.name}. No rush, and no need to do them in a row.`}</p></div></div>
        </> : <div className={s.milestone}><FiHeart /><div><h2>{numbersVisible ? "Your progress isn’t available yet." : "Your pace, without the numbers."}</h2><p>{numbersVisible ? "Return to Today and refresh to try again. Your saved plans are still there." : "Streaks and levels are hidden. You can enjoy the scenery, or change this in Personalize Tempo."}</p><button className={s.textButton} onClick={numbersVisible ? onBack : onSetup}>{numbersVisible ? "Back to Today" : "Personalize Tempo"}<FiArrowRight /></button></div></div>}
      </div>
      <aside className={s.companion}>
        <div className={s.tempoGreeting}><div className={s.avatar}><WorkspaceAvatar size={96} /></div><div className={s.speech}><span>A LITTLE NOTE FROM TEMPO</span><p>{dailyEncouragement(now, data.timezone)}</p><small>For today · {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: data.timezone }).format(now)}</small></div></div>
        {known && numbersVisible && activity && <>
          <div className={s.stats}><div><FiSun /><strong>{activity.currentDays}</strong><span>day streak</span><small>Best: {activity.bestDays} {activity.bestDays === 1 ? "day" : "days"}</small></div><div><FiCheck /><strong>{activity.totalCompletions}</strong><span>small wins</span><small>{activity.completedToday} today</small></div></div>
          <div className={s.week}><h2>Your last seven days</h2><div>{activity.recentDays.map(day => <span key={day.date} className={s.weekDay}><small>{weekday(day.date)}</small><span data-active={day.active} aria-label={`${day.date}: ${day.completed} ${day.completed === 1 ? "completion" : "completions"}`}>{day.active ? <FiCheck /> : <span aria-hidden="true">·</span>}</span></span>)}</div><p>{activity.activeToday ? "You’ve added a step to your trail today." : activity.currentDays ? "Yesterday’s streak is still here. Today is yours to use." : "A new day. Your earlier steps still count."}</p></div>
          <div className={s.celebrate}><button disabled={activity.totalCompletions === 0} className={s.celebrateButton} onClick={() => setCelebration(celebration + 1)}><FiStar />Celebrate your progress</button>{celebration > 0 && <><p role="status">That’s {activity.totalCompletions} little {activity.totalCompletions === 1 ? "win" : "wins"} worth noticing.</p><span className={s.sparkles} key={celebration} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <FiStar key={index} style={{ "--dx": `${(index - 4) * 28}px`, "--dy": `${-35 - index % 3 * 25}px`, "--rotate": `${index * 35}deg` } as CSSProperties} />)}</span></>}</div>
        </>}
        <button className={s.returnButton} onClick={onBack}>Back to my day <FiArrowRight /></button>
      </aside>
    </div>
    <details className={s.rules}><summary><FiTrendingUp />How your journey grows</summary><div><p>Complete a saved task or routine step to add one active day. More checkoffs on that day add small wins, but not extra days. Repeat checkoffs of the same item on the same day count once.</p><p>Levels follow your total recorded active days: 0, 3, 7, 14, 30 and 60. Level 1 is your starting point. Days don’t need to be consecutive. A break never erases earlier activity. Undoing a checkoff corrects the totals.</p><p>Your streak counts consecutive active days. Yesterday’s streak stays current until the end of today in {data.timezone}. This page celebrates recorded activity; it does not measure your health or your worth.</p><p>{activity?.historyNote ?? "No saved activity summary is available."} Daily encouragement is written by Tempo, not generated from personal records.</p><button className={s.textButton} onClick={onSetup}>Change progress display<FiArrowRight /></button></div></details>
  </section>;
}

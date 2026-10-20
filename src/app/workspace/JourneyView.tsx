"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { FiArrowLeft, FiArrowRight, FiAward, FiCheck, FiCompass, FiHeart, FiPause, FiPlay, FiSliders, FiStar } from "react-icons/fi";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import { dailyEncouragement, journeyProgress, journeyStops } from "./journey-model";
import type { Workspace } from "./workspace-data";
import s from "./journey.module.css";

const markerPositions = [{ x: 26, y: 70 }, { x: 50, y: 50 }, { x: 75, y: 31 }];
const milestoneArt = ["journey-sprout", "journey-sun", "journey-stones", "journey-bloom", "journey-mountain", "journey-earth"];
function MilestoneArt({ index }: { index: number }) {
  const art = milestoneArt[index];
  return <Image src={`/images/${art}.webp`} width={64} height={64} alt="" />;
}

export function JourneyView({ data, now, preview, onBack, onSetup, motion, setMotion }: { data: Workspace; now: Date; preview: boolean; onBack: () => void; onSetup: () => void; motion: boolean; setMotion: (value: boolean) => void }) {
  const activity = data.activityStreak;
  const progress = journeyProgress(activity?.totalActiveDays ?? 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [celebration, setCelebration] = useState(0);
  const numbersVisible = data.setup?.showStreak !== false;
  const known = typeof activity?.totalActiveDays === "number";
  const showProgress = known && numbersVisible && activity;
  const stopIndex = selected ?? progress.index;
  const stop = journeyStops[stopIndex];
  const reached = progress.earnedDays >= stop.days;
  const firstMarker = Math.min(Math.max(stopIndex - 1, 0), journeyStops.length - 3);
  const viewedDay = activity?.recentDays.find(day => day.date === selectedDay);
  const dayFormat = (date: string, weekday: "short" | "long") => new Intl.DateTimeFormat(undefined, { weekday, ...(weekday === "long" ? { month: "short", day: "numeric" } as const : {}), timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const selectStop = (index: number) => { setSelected(index); setCelebration(0); };
  return <section className={s.journey} data-motion={motion} aria-labelledby="journey-title">
    <div className={s.hero}>
      <header className={s.heading}>
        <span className={s.eyebrow}>{preview ? "SAMPLE JOURNEY · YOUR LIFE. YOUR PACE." : "YOUR LIFE. YOUR PACE."}</span>
        <h1 id="journey-title">Your world,<br />one day at a time.</h1>
        <p>Little things count. So do fresh starts.</p>
      </header>
      <div className={s.world}>
        <div className={s.worldTools}><button className={s.motion} onClick={() => setMotion(!motion)} aria-pressed={!motion} title="Animation choice lasts while this workspace is open. Device reduced-motion settings are always respected.">{motion ? <FiPause /> : <FiPlay />}{motion ? "Pause animations" : "Enable animations"}</button></div>
        <div className={s.worldCanvas} data-no-swipe="true" aria-label="Your interactive little world">
          <Image src="/images/journey-earth.webp" alt="A soft, three-dimensional Earth with turquoise seas, green islands, a little home and clouds." width={1254} height={1254} sizes="(max-width: 800px) 95vw, 55vw" loading="eager" className={s.earth} />
          {showProgress && journeyStops.slice(firstMarker, firstMarker + 3).map((point, offset) => {
            const index = firstMarker + offset;
            return <button key={point.name} className={s.stop} style={{ left: `${markerPositions[offset].x}%`, top: `${markerPositions[offset].y}%` }} data-stop={index} data-earned={progress.earnedDays >= point.days} data-current={progress.index === index} aria-pressed={stopIndex === index} aria-controls="journey-stop-detail" aria-label={`Level ${index + 1}: ${point.name}. ${point.days === 0 ? "Starting point" : `${point.days} active days. ${progress.earnedDays >= point.days ? "Reached" : `${point.days - progress.earnedDays} more ${point.days - progress.earnedDays === 1 ? "day" : "days"}`}`}`} onClick={() => selectStop(index)}>
              {index === progress.index && <span className={s.mapAvatar} aria-hidden="true"><WorkspaceAvatar size={58} /></span>}
              <span className={s.stopCircle}>{progress.earnedDays >= point.days && index !== progress.index ? <FiCheck /> : index + 1}</span><span className={s.stopLabel}>{point.name}</span>
            </button>;
          })}
          {celebration > 0 && <div className={s.sparkles} key={celebration} aria-hidden="true">{Array.from({ length: 13 }, (_, index) => <FiStar key={index} style={{ "--dx": `${Math.cos(index * Math.PI * 2 / 13) * 190}px`, "--dy": `${Math.sin(index * Math.PI * 2 / 13) * 180}px`, "--rotate": `${index * 35}deg` } as CSSProperties} />)}</div>}
        </div>
        {showProgress && <div className={s.worldNavigation}><button aria-label="Previous milestone" disabled={stopIndex === 0} onClick={() => selectStop(stopIndex - 1)}><FiArrowLeft /></button><div><span className={s.eyebrow}>{stopIndex === progress.index ? `YOUR WORLD · LEVEL ${progress.level}` : `EXPLORING LEVEL ${stopIndex + 1}`}</span><strong>{stop.name}</strong>{stopIndex !== progress.index ? <button className={s.returnToLevel} onClick={() => setSelected(null)}>Return to my level {progress.level}</button> : <span className={s.exploreHint}>Choose a milestone to explore</span>}</div><button aria-label="Next milestone" disabled={stopIndex === journeyStops.length - 1} onClick={() => selectStop(stopIndex + 1)}><FiArrowRight /></button></div>}
      </div>
      <div className={s.progressSummary}>
        {showProgress ? <>
          <div className={s.streak}><Image src="/images/journey-flame.webp" width={80} height={80} alt="" /><div><p><strong>{activity.currentDays}</strong> <span>day streak</span></p><small>Best: {activity.bestDays} {activity.bestDays === 1 ? "day" : "days"} · A break doesn’t erase your progress.</small></div></div>
          <div className={s.week} aria-label="Your last seven days" data-no-swipe="true">{activity.recentDays.map(day => <button key={day.date} aria-pressed={selectedDay === day.date} aria-label={`${dayFormat(day.date, "long")}: ${day.completed} ${day.completed === 1 ? "completion" : "completions"}`} onClick={() => setSelectedDay(day.date)}><small>{dayFormat(day.date, "short")}</small><span data-active={day.active}>{day.active ? <FiCheck /> : <span aria-hidden="true">·</span>}</span></button>)}</div>
          <p className={s.dayDetail} aria-live="polite">{viewedDay ? `${dayFormat(viewedDay.date, "long")}: ${viewedDay.completed} saved ${viewedDay.completed === 1 ? "checkoff" : "checkoffs"}.` : activity.activeToday ? "You’ve added a little good to today." : activity.currentDays ? "Yesterday’s streak is still here. Today is yours to use." : "A fresh start. Your earlier steps still count."}</p>
          <div className={s.stats}><div><FiCheck /><p><strong>{activity.totalCompletions}</strong> <span>small wins</span></p><small>{activity.completedToday} today</small></div><div><FiAward /><p><strong>Level {progress.level}</strong></p><small>{progress.current.name}</small></div></div>
          <div className={s.levelProgress}><div><span>{progress.earnedDays} active {progress.earnedDays === 1 ? "day" : "days"}</span><span>{progress.next ? `${progress.remaining} more active ${progress.remaining === 1 ? "day" : "days"} to ${progress.next.name}` : "All six milestones reached"}</span></div><progress aria-label="Progress to next journey level" max={100} value={progress.percent} /></div>
        </> : <div className={s.quietState}><FiHeart /><h2>{numbersVisible ? "Your progress isn’t available yet." : "Your pace, without the numbers."}</h2><p>{numbersVisible ? "Return to Today and refresh to try again. Your saved plans are still there." : "Streaks and levels are hidden. Enjoy a little room to breathe."}</p><button className={s.textButton} onClick={numbersVisible ? onBack : onSetup}>{numbersVisible ? "Back to Today" : "Change progress display"}<FiArrowRight /></button></div>}
      </div>
      <div className={s.companion}>
        <div className={s.tempoGreeting}><div className={s.avatar}><WorkspaceAvatar size={102} /></div><div className={s.speech}><span>A LITTLE NOTE FROM TEMPO</span><p>{dailyEncouragement(now, data.timezone)}</p><small>For today · {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: data.timezone }).format(now)}</small></div></div>
        <div className={s.actions}>{showProgress && <button disabled={activity.totalCompletions === 0} className={s.celebrateButton} onClick={() => setCelebration(value => value + 1)}><FiStar />Celebrate your progress</button>}<button className={s.backButton} onClick={onBack}>Back to Today <FiArrowRight /></button></div>
        <p key={celebration} className={s.celebrationStatus} data-celebrating={celebration > 0} role="status">{celebration > 0 && showProgress ? `${activity.totalCompletions} little ${activity.totalCompletions === 1 ? "win" : "wins"} worth noticing. This moment is yours.` : ""}</p>
      </div>

    </div>
    {showProgress && <section className={s.milestones} aria-labelledby="milestones-title"><header><h2 id="milestones-title">Milestones, at your pace.</h2><p>Your active days add up, even when life takes a detour.</p></header><div className={s.milestoneStrip} role="group" aria-label="Journey milestones" data-no-swipe="true">{journeyStops.map((point, index) => <button key={point.name} aria-pressed={stopIndex === index} aria-controls="journey-stop-detail" aria-label={`${point.name}, ${point.days === 0 ? "starting point" : `${point.days} active days, ${progress.earnedDays >= point.days ? "reached" : "ahead"}`}`} data-earned={progress.earnedDays >= point.days} onClick={() => selectStop(index)}><span className={s.milestoneArt}><MilestoneArt index={index} /></span><strong>{point.name}</strong><small>{point.days === 0 ? "Your starting point" : `${point.days} active days`}</small><span className={s.milestoneState}>{point.days === 0 ? "Start here" : progress.earnedDays >= point.days ? <><FiCheck />Reached</> : "Ahead"}</span></button>)}</div><div id="journey-stop-detail" className={s.milestoneDetail} aria-live="polite" aria-atomic="true"><FiCompass /><div><span className={s.eyebrow}>{stop.days === 0 ? "YOUR STARTING POINT" : reached ? `LEVEL ${stopIndex + 1} · REACHED` : `AHEAD · LEVEL ${stopIndex + 1}`}</span><h3>{stop.title}</h3><p>{reached ? stop.detail : `${stop.days - progress.earnedDays} more active ${stop.days - progress.earnedDays === 1 ? "day" : "days"} to ${stop.name}. No rush, and no need to do them in a row.`}</p></div></div></section>}
    <footer className={s.footer}><details className={s.rules}><summary>How your journey grows</summary><div><p><strong>Small wins.</strong> Complete a saved task or routine step to add one active day. More checkoffs add small wins, but not extra days. Repeat checkoffs of the same item on the same day count once.</p><p><strong>Milestones stay with you.</strong> Levels follow your total recorded active days: 0, 3, 7, 14, 30 and 60. Level 1 is your starting point. Days don’t need to be consecutive. A break never erases earlier activity. Undoing a checkoff corrects the totals.</p><p><strong>Your local day.</strong> Streaks count consecutive active days. Yesterday’s streak stays current until the end of today in {data.timezone}. This page celebrates recorded activity; it does not measure your health or your worth.</p><p>{activity?.historyNote ?? "No saved activity summary is available."} Daily encouragement is written by Tempo, not generated from personal records.</p></div></details><button className={s.textButton} onClick={onSetup}><FiSliders />Progress display</button></footer>
  </section>;
}

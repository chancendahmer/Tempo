"use client";
import { useState, type ReactNode } from "react";
import { FiArrowRight, FiCalendar, FiCheck, FiClock, FiPlus, FiZap } from "react-icons/fi";
import type { SavedLifeItem } from "@/server/domain/life-items";
import type { Workspace } from "./workspace-data";
import { workoutPrograms, workoutTaskDraft } from "./workout-programs";
import ui from "./workspace.module.css";
import s from "./demo-content.module.css";

type Props = {
  data: Workspace; today: string; date: string; setDate: (value: string) => void; saving: boolean;
  plan: (draft: { title: string; estimatedMinutes: number }) => void;
  log: () => void; actions: (item: SavedLifeItem) => ReactNode;
  showTasks: () => void;
};
export function FitnessView({ data, today, date, setDate, saving, plan, log, actions, showTasks }: Props) {
  const [programId, setProgramId] = useState(workoutPrograms[0].id);
  const [sessionIndex, setSessionIndex] = useState(0);
  const program = workoutPrograms.find(p => p.id === programId)!;
  const session = program.sessions[sessionIndex];
  const logged = data.items.filter((item): item is SavedLifeItem & { data: Extract<SavedLifeItem["data"], { kind: "workout" }> } => item.data.kind === "workout" && item.data.date === date);
  const planned = data.tasks.filter(task => !["completed", "abandoned"].includes(task.status) && workoutPrograms.some(program => program.sessions.some(session => task.title === workoutTaskDraft(program, session).title)));
  return <>
    <div className={ui.sectionHeading}><div className={ui.row}><h2>Your movement</h2><input className={ui.dateInput} aria-label="Movement date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /><button className={ui.textButton} onClick={() => setDate(today)}>Today</button></div><button className={ui.secondary} onClick={log}><FiPlus /> Log completed movement</button></div>
    <div className={s.activitySummary}>
      <div><span className={s.activityIcon}><FiZap /></span><strong>{logged.reduce((n, item) => n + item.data.minutes, 0)} <small>minutes logged</small></strong><span>For the selected day</span></div>
      <button onClick={showTasks}><FiCalendar /><strong>{planned.length} <small>open {planned.length === 1 ? "session" : "sessions"} · all dates</small></strong><span>View in To-do <FiArrowRight /></span></button>
    </div>
    <div className={ui.sectionHeading}><div><h2>Find your starting point</h2><p className={ui.muted}>Choose a template, then plan one session.</p></div></div>
    <div className={s.programChoices} role="group" aria-label="Workout programs">{workoutPrograms.map((p, i) => <button key={p.id} className={s.programChoice} data-tone={i} aria-pressed={p.id === programId} onClick={() => { setProgramId(p.id); setSessionIndex(0); }}>
      <span className={s.programSymbol}><FiZap />{p.id === programId && <FiCheck />}</span><strong>{p.title}</strong><span>{p.cadence} · {p.equipment}</span><small>{p.description}</small>
    </button>)}</div>
    <article className={s.programDetail}>
      <div className={s.programIntro}><p className={ui.eyebrow}>EXAMPLE PROGRAM</p><h2>{program.title}</h2><p>{program.guidance}</p><details><summary>Make it work for you</summary><p>These are general templates, not personalized coaching. Adjust to your experience and ability; stop if a movement hurts. A qualified trainer can help with technique. The home circuit is a starting point, not a complete fitness plan.</p><a href="https://www.cdc.gov/physical-activity-basics/guidelines/adults.html" target="_blank" rel="noreferrer">Read the CDC’s general activity guidance</a></details></div>
      <div className={s.sessionDetail}><div className={s.sessionTabs} role="group" aria-label="Program sessions">{program.sessions.map((day, index) => <button key={day.name} aria-pressed={sessionIndex === index} onClick={() => setSessionIndex(index)}>{day.name}</button>)}</div>
        <div className={ui.between}><h3>{session.name}</h3><span className={s.duration}><FiClock /> About {session.minutes} min</span></div>
        <ul className={s.exerciseList}>{session.exercises.map((exercise, index) => <li key={exercise.name}><span className={s.exerciseNumber} aria-hidden="true">{index + 1}</span><span>{exercise.name}</span><strong>{exercise.dose}</strong></li>)}</ul>
        <button className={ui.primary} disabled={saving} onClick={() => plan(workoutTaskDraft(program, session))}><FiPlus /> Plan this session</button><p className={s.helper}>Choose a date in To-do. It won’t be marked as completed.</p>
      </div>
    </article>
    <div className={ui.sectionHeading}><h2>Completed movement</h2><small>{logged.length} {logged.length === 1 ? "entry" : "entries"}</small></div>
    <div className={ui.twoColumns}>{logged.map(item => <article className={ui.card} key={item.id}><div className={ui.between}><span className={`${ui.tileIcon} ${ui.sage}`}><FiCheck /></span>{actions(item)}</div><h3>{item.data.title}</h3><p>{item.data.activity} · {item.data.minutes} minutes</p></article>)}</div>
    {!logged.length && <div className={ui.infoStrip}>No movement logged for this day. Log it when it happens.</div>}
  </>;
}

"use client";
import { useState, type ReactNode } from "react";
import { FiArrowRight, FiCalendar, FiCheck, FiClock, FiEdit2, FiPlus, FiTrash2, FiZap } from "react-icons/fi";
import type { LifeItem, SavedLifeItem } from "../../server/domain/life-items";
import type { Workspace } from "./workspace-data";
import { exerciseAlternative, workoutPrograms, workoutSources, workoutTaskDraft, type WorkoutProgram, type WorkoutSession } from "./workout-programs";
import { WorkoutArt } from "./WorkoutArt";
import { WorkoutPlanEditor, type WorkoutPlan } from "./WorkoutPlanEditor";
import { WorkoutLogEditor, type WorkoutLog } from "./WorkoutLogEditor";
import ui from "./workspace.module.css";
import s from "./demo-content.module.css";
import f from "./food-fitness.module.css";

type Props = {
  data: Workspace; today: string; date: string; setDate: (value: string) => void; saving: boolean;
  plan: (draft: { title: string; estimatedMinutes: number }) => void;
  log?: () => void; actions?: (item: SavedLifeItem) => ReactNode; showTasks: () => void;
  save: (data: LifeItem, item?: SavedLifeItem) => Promise<boolean>; remove: (item: SavedLifeItem) => void;
};
export function FitnessView({ data, today, date, setDate, saving, plan, showTasks, save, remove }: Props) {
  const [programId, setProgramId] = useState(workoutPrograms[0].id);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [history, setHistory] = useState(false);
  const [planEditor, setPlanEditor] = useState<{ program: WorkoutProgram; item?: SavedLifeItem } | null>(null);
  const [logEditor, setLogEditor] = useState<{ draft?: Partial<WorkoutLog>; item?: SavedLifeItem } | null>(null);
  const program = workoutPrograms.find(p => p.id === programId)!;
  const session = program.sessions[sessionIndex];
  const allLogs = data.items.filter((item): item is SavedLifeItem & { data: WorkoutLog } => item.data.kind === "workout").sort((a, b) => b.data.date.localeCompare(a.data.date));
  const logged = allLogs.filter(item => item.data.date === date);
  const savedPlans = data.items.filter((item): item is SavedLifeItem & { data: WorkoutPlan } => item.data.kind === "workout_plan");
  function logSession(program: { title: string; id?: string; templateId?: string }, session: WorkoutSession, savedId?: string) { setLogEditor({ draft: { title: workoutTaskDraft(program, session).title, minutes: session.minutes, activity: (program.templateId ?? program.id) === "walking-mobility" ? "Walk" : "Strength", sessionName: session.name, ...(savedId ? { programId: savedId } : {}) } }); }
  return <>
    <div className={f.toolbar}><div className={f.actions}><h2>Your movement</h2><input className={ui.dateInput} aria-label="Movement date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /><button className={ui.textButton} onClick={() => setDate(today)}>Today</button></div><button className={ui.secondary} onClick={() => setLogEditor({})}><FiPlus />Log completed movement</button></div>
    <div className={s.activitySummary}><div><span className={s.activityIcon}><FiZap /></span><strong>{logged.reduce((n, item) => n + item.data.minutes, 0)} <small>minutes logged</small></strong><span>For the selected day · entered by you</span></div><button onClick={showTasks}><FiCalendar /><strong><small>Your scheduled sessions</small></strong><span>View dates and tasks in To-do <FiArrowRight /></span></button></div>
    <div className={ui.sectionHeading}><div><h2>Your saved plans</h2><p className={ui.muted}>Choose a session, then schedule it or log what you completed.</p></div></div>
    <div className={f.savedPlans}>{savedPlans.map(item => <SavedPlanCard key={item.id} item={item} saving={saving} schedule={session => plan(workoutTaskDraft(item.data, session))} log={session => logSession(item.data, session, item.id)} edit={() => setPlanEditor({ item, program: workoutPrograms.find(program => program.id === item.data.templateId) ?? workoutPrograms[0] })} remove={() => remove(item)} />)}{!savedPlans.length && <div className={f.empty}>Pick a starting point below and choose “Make this my plan.” Your saved plan will appear here.</div>}</div>
    <div className={ui.sectionHeading}><div><h2>Find your starting point</h2><p className={ui.muted}>Six editable templates. Choose one that fits your space and experience.</p></div></div>
    <div className={f.programGrid} role="group" aria-label="Workout programs">{workoutPrograms.map(p => <button key={p.id} className={f.programCard} aria-pressed={p.id === programId} onClick={() => { setProgramId(p.id); setSessionIndex(0); }}><WorkoutArt kind={p.id} /><strong>{p.title}</strong><span>{p.cadence} · {new Set(p.sessions.map(session => session.minutes)).size === 1 ? p.sessions[0].minutes : `${Math.min(...p.sessions.map(session => session.minutes))}–${Math.max(...p.sessions.map(session => session.minutes))}`} min</span><span>{p.equipment}</span><small>{p.description}</small></button>)}</div>
    <article className={s.programDetail}><div className={s.programIntro}><p className={ui.eyebrow}>EDITABLE TEMPLATE</p><h2>{program.title}</h2><div className={f.programMeta}><span>{program.experience}</span><span>{program.equipment}</span></div><p>{program.guidance}</p><p><strong>Rest:</strong> {program.rest}.</p><button className={ui.primary} disabled={saving} onClick={() => setPlanEditor({ program })}><FiPlus />Make this my plan</button><details><summary>Using these templates</summary><p>General examples for adults; adjust them to your ability and experience. Stop a movement if it hurts. For technique or a plan suited to your needs, work with a qualified professional.</p><p>General guidance and movement demonstrations:</p>{workoutSources.map(source => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</details></div>
      <div className={s.sessionDetail}><div className={s.sessionTabs} role="group" aria-label="Program sessions">{program.sessions.map((day, index) => <button key={day.name} aria-pressed={sessionIndex === index} onClick={() => setSessionIndex(index)}>{day.name}</button>)}</div><div className={ui.between}><h3>{session.name}</h3><span className={s.duration}><FiClock />About {session.minutes} min</span></div><ExerciseList session={session} /><div className={f.actions}><button className={ui.secondary} disabled={saving} onClick={() => plan(workoutTaskDraft(program, session))}><FiCalendar />Schedule this session</button><button className={ui.textButton} disabled={saving} onClick={() => logSession(program, session)}><FiCheck />Log completed session</button></div><p className={s.helper}>Scheduling opens a task where you choose the date and time. Completion is logged separately.</p></div>
    </article>
    <div className={`${f.toolbar} ${f.historyHeading}`}><h2>Completed movement</h2><div className={s.sessionTabs} role="group" aria-label="Movement history range"><button aria-pressed={!history} onClick={() => setHistory(false)}>Selected day</button><button aria-pressed={history} onClick={() => setHistory(true)}>All history</button></div></div>
    <div className={ui.twoColumns}>{(history ? allLogs : logged).map(item => <article className={ui.card} key={item.id}><div className={ui.between}><span className={`${ui.tileIcon} ${ui.sage}`}><FiCheck /></span><div className={f.actions}><button className={ui.iconButton} aria-label={`Edit ${item.data.title}`} onClick={() => setLogEditor({ item })}><FiEdit2 /></button><button className={ui.iconButton} aria-label={`Delete ${item.data.title}`} disabled={saving} onClick={() => remove(item)}><FiTrash2 /></button></div></div><h3>{item.data.title}</h3><p>{item.data.activity} · {item.data.minutes} minutes</p><small>{item.data.date}</small>{item.data.notes && <p className={ui.prewrap}>{item.data.notes}</p>}</article>)}</div>
    {!(history ? allLogs : logged).length && <div className={ui.infoStrip}>No movement logged {history ? "yet" : "for this day"}. Log it when it happens.</div>}
    {planEditor && <WorkoutPlanEditor {...planEditor} latestItem={data.items.find(item => item.id === planEditor.item?.id)} saving={saving} save={save} close={() => setPlanEditor(null)} />}
    {logEditor && <WorkoutLogEditor {...logEditor} date={date} today={today} latestItem={data.items.find(item => item.id === logEditor.item?.id)} saving={saving} save={save} close={() => setLogEditor(null)} />}
  </>;
}
function ExerciseList({ session }: { session: WorkoutSession }) { return <ul className={s.exerciseList}>{session.exercises.map((exercise, index) => <li key={`${exercise.name}-${index}`}><span className={s.exerciseNumber} aria-hidden="true">{index + 1}</span><div><span>{exercise.name}</span>{exerciseAlternative(exercise) && <details className={f.exerciseDetails}><summary>Alternative</summary><p>{exerciseAlternative(exercise)} · adjust the dose to suit the movement.</p></details>}</div><strong>{exercise.dose}</strong></li>)}</ul>; }
function SavedPlanCard({ item, saving, schedule, log, edit, remove }: { item: SavedLifeItem & { data: WorkoutPlan }; saving: boolean; schedule: (session: WorkoutSession) => void; log: (session: WorkoutSession) => void; edit: () => void; remove: () => void }) {
  const [selected, setSelected] = useState(0);
  const session = item.data.sessions[Math.min(selected, item.data.sessions.length - 1)];
  return <article className={f.savedPlan}><div className={f.toolbar}><div><p className={ui.eyebrow}>SAVED PLAN</p><h3>{item.data.title}</h3><small>{item.data.sessions.length} {item.data.sessions.length === 1 ? "session" : "sessions"}</small></div><div className={f.actions}><button className={ui.secondary} onClick={edit}><FiEdit2 />Customize</button><button className={ui.iconButton} disabled={saving} onClick={remove} aria-label={`Delete plan ${item.data.title}`}><FiTrash2 /></button></div></div><div className={f.toolbar}><select aria-label={`Choose session from ${item.data.title}`} value={Math.min(selected, item.data.sessions.length - 1)} onChange={e => setSelected(Number(e.target.value))}>{item.data.sessions.map((session, index) => <option key={index} value={index}>{session.name} · {session.minutes} min</option>)}</select><div className={f.actions}><button className={ui.primary} disabled={saving} onClick={() => schedule(session)}><FiCalendar />Schedule</button><button className={ui.secondary} disabled={saving} onClick={() => log(session)}><FiCheck />Log completed</button></div></div><details><summary>Session movements</summary><ExerciseList session={session} /></details></article>;
}

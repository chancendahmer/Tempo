import { useState } from "react";
import { FiArrowUpRight, FiCheck, FiCheckCircle, FiClock, FiEdit2, FiFlag, FiPlus, FiPlay, FiSun, FiTarget, FiTrash2 } from "react-icons/fi";
import { localDay } from "../../server/domain/life-items";
import type { Workspace } from "./workspace-data";
import s from "./planning.module.css";
import { taskDueLabel } from "./task-due-label";

type Task = Workspace["tasks"][number];
type Goal = Workspace["goals"][number];
export function TasksView({ data, today, saving, edit, start, complete, remove }: { data: Workspace; today: string; saving: boolean; edit: (task?: Task) => void; start: (task: Task) => void; complete: (task: Task) => void; remove: (task: Task) => void }) {
  const [view, setView] = useState("All");
  const due = (task: Task) => task.dueAt ? localDay(new Date(task.dueAt), data.timezone) : null;
  const end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);
  const active = data.tasks.filter(t => t.status !== "completed");
  const matches = (t: Task) => view === "Done" ? t.status === "completed" : t.status !== "completed" && (view === "All" || t.status === "in_progress" || Boolean(due(t) && due(t)! <= (view === "Today" ? today : weekEnd)));
  const shown = data.tasks.filter(matches).sort((a, b) => (a.dueAt ?? "z").localeCompare(b.dueAt ?? "z"));
  const groups = view === "Done" ? [{ label: "Checked off", icon: <FiCheckCircle />, tasks: shown }] : [
    { label: "In focus", icon: <FiPlay />, tasks: shown.filter(t => t.status === "in_progress") },
    { label: "Carry forward", icon: <FiArrowUpRight />, tasks: shown.filter(t => t.status !== "in_progress" && due(t) && due(t)! < today) },
    { label: "Today", icon: <FiSun />, tasks: shown.filter(t => t.status !== "in_progress" && due(t) === today) },
    { label: "Coming up", icon: <FiClock />, tasks: shown.filter(t => t.status !== "in_progress" && due(t) && due(t)! > today) },
    { label: "Whenever you’re ready", icon: <FiFlag />, tasks: shown.filter(t => t.status !== "in_progress" && !due(t)) },
  ];
  return <div className={s.tasksLayout}><div><div className={s.toolbar}><div className={s.tabs} aria-label="Task view">{["Today", "Next 7 days", "All", "Done"].map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}</div><button className={s.addButton} onClick={() => edit()}><FiPlus /> Add task</button></div>
    {groups.filter(g => g.tasks.length).map(group => <section className={s.taskGroup} data-tone={group.label === "Carry forward" ? 1 : group.label === "Coming up" ? 2 : 0} key={group.label}><h2>{group.icon}{group.label}<span>{group.tasks.length}</span></h2><div className={s.checklist}>{group.tasks.map(task => <div className={`${s.task} ${task.status === "completed" ? s.finished : ""}`} key={task.id}><button className={s.checkbox} disabled={saving || task.status === "completed"} aria-label={`Complete ${task.title}`} onClick={() => complete(task)}>{task.status === "completed" && <FiCheck />}</button><button className={s.taskTitle} onClick={() => edit(task)}><strong>{task.title}</strong><span>{task.dueAt ? taskDueLabel(task.dueAt, data.timezone, due(task) !== today) : "No date"}{task.goalId && <><i /> <FiTarget /> Goal step</>}</span></button>{task.estimatedMinutes && <span className={s.duration}><FiClock />{task.estimatedMinutes}m</span>}{task.status !== "completed" && <button className={s.play} disabled={saving} onClick={() => start(task)} aria-label={`Focus on ${task.title}`}><FiPlay /></button>}<button className={s.play} disabled={saving} onClick={() => remove(task)} aria-label={`Remove ${task.title}`}><FiTrash2 /></button></div>)}</div></section>)}
    {!shown.length && <div className={s.clearState}><FiCheckCircle /><h2>{view === "Done" ? "Your wins go here" : "Room to breathe"}</h2><p>{view === "Done" ? "Check off a task when you’re ready." : "No tasks in this view."}</p><button className={s.addButton} onClick={() => edit()}><FiPlus /> Add task</button></div>}
    {view !== "All" && view !== "Done" && active.some(t => !t.dueAt) && <button className={s.unscheduled} onClick={() => setView("All")}><FiInboxIcon />{active.filter(t => !t.dueAt).length} undated tasks <FiArrowUpRight /></button>}
    </div><aside className={s.focusAside}><div className={s.clockArt} aria-hidden="true"><span /><FiPlay /></div><span className={s.kicker}>LESS SWITCHING</span><h2>Pick one.<br />Press play.</h2><p>Your focus timer takes it from here.</p><div className={s.legend}><span><i /> Do now</span><span><i /> Plan ahead</span><span><FiCheck /> Done</span></div></aside></div>;
}
function FiInboxIcon() { return <FiFlag />; }

function GoalArt({ variant }: { variant: number }) {
  return <svg viewBox="0 0 420 150" className={s.goalArt} aria-hidden="true"><circle cx={variant % 2 ? 90 : 330} cy="43" r="25" fill="currentColor" opacity=".25" /><path d="M0 127 Q85 25 180 105 T420 65 V150 H0Z" fill="currentColor" opacity=".13" /><path d="M0 148 Q140 70 270 125 T420 110 V150 H0Z" fill="currentColor" opacity=".22" /><path d="M180 150 Q290 123 233 96 Q190 74 285 50" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray="1 15" /><path d="M286 54V16l27 9-27 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><circle cx="215" cy="126" r="5" fill="white" /></svg>;
}
export function GoalsView({ data, saving, edit, addStep, editStep, achieve, remove }: { data: Workspace; saving: boolean; edit: (goal?: Goal) => void; addStep: (id: string) => void; editStep: (task: Task) => void; achieve: (id: string) => void; remove: (goal: Goal) => void }) {
  const [showAchieved, setShowAchieved] = useState(false);
  const goals = data.goals.filter(g => showAchieved ? g.status === "completed" : g.status !== "completed");
  return <><div className={s.toolbar}><div className={s.tabs}><button aria-pressed={!showAchieved} onClick={() => setShowAchieved(false)}>Growing <span>{data.goals.filter(g => g.status !== "completed").length}</span></button><button aria-pressed={showAchieved} onClick={() => setShowAchieved(true)}>Achieved <FiCheck /></button></div><button className={s.addButton} onClick={() => edit()}><FiPlus /> New goal</button></div><div className={s.goalGrid}>{goals.map((goal) => {
    const tone = [...goal.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
    const linked = data.tasks.filter(t => t.goalId === goal.id), done = linked.filter(t => t.status === "completed").length;
    const next = linked.find(t => t.status !== "completed");
    const progress = linked.length ? Math.round(done / linked.length * 100) : 0;
    return <article className={s.goal} data-tone={tone} key={goal.id}><div className={s.goalCover}><GoalArt variant={tone} /><span className={s.goalLabel}>{goal.status === "completed" ? <FiCheckCircle /> : <FiFlag />}{goal.status === "completed" ? "Achieved" : "Long-term goal"}</span><button className={s.editGoal} aria-label={`Edit ${goal.title}`} onClick={() => edit(goal)}><FiEdit2 /></button></div><div className={s.goalBody}><h2>{goal.title}</h2>{goal.description && <p className={s.goalDescription}>{goal.description}</p>}<div className={s.progressHeading}><span>{done} / {linked.length} steps</span><strong>{progress}%</strong></div><progress aria-label={`${goal.title} linked steps complete`} value={done} max={Math.max(1, linked.length)} /><div className={s.nextStep}><span className={s.kicker}>{goal.status === "completed" ? "LOOK HOW FAR YOU’VE COME" : "NEXT SMALL STEP"}</span>{next ? <button onClick={() => editStep(next)}><span>{next.title}</span><FiArrowUpRight /></button> : <p>{goal.status === "completed" ? "A goal worth celebrating." : linked.length ? "Steps finished. Ready to celebrate?" : "Start with something small."}</p>}</div><details className={s.goalDetails}><summary>View steps & details</summary><div className={s.milestones}>{linked.map(t => <button key={t.id} onClick={() => editStep(t)}><span>{t.status === "completed" ? <FiCheckCircle /> : <FiTarget />}</span>{t.title}</button>)}{!linked.length && <p>No steps yet.</p>}</div>{goal.description && <p>{goal.description}</p>}{goal.status !== "completed" && <button className={s.achieve} disabled={saving} onClick={() => achieve(goal.id)}><FiCheck /> Mark achieved</button>}<button className={s.achieve} disabled={saving} onClick={() => remove(goal)}><FiTrash2 /> Remove goal</button></details>{goal.status !== "completed" && <button className={s.goalAdd} onClick={() => addStep(goal.id)}><FiPlus /> Add a step</button>}</div></article>;
  })}<button className={s.newGoal} onClick={() => edit()}><span><FiPlus /></span><strong>{goals.length ? "Room for another direction" : "What are you working toward?"}</strong><small>Add a long-term goal</small></button></div></>;
}

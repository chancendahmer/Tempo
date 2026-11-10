import Image from "next/image";
import { useState } from "react";
import { FiArrowUpRight, FiCheck, FiCheckCircle, FiClock, FiEdit2, FiFlag, FiInbox, FiPlus, FiPlay, FiSun, FiTarget, FiTrash2 } from "react-icons/fi";
import { localDay } from "../../server/domain/life-items";
import type { Workspace } from "./workspace-data";
import { taskDueLabel } from "./task-due-label";
import s from "./planning.module.css";

type Task = Workspace["tasks"][number];
type Goal = Workspace["goals"][number];
type TaskView = "All" | "Today" | "Next 7 days" | "Done";

export function TasksView({ data, today, saving, edit, start, complete, reopen, remove }: {
  data: Workspace; today: string; saving: boolean; edit: (task?: Task) => void;
  start: (task: Task) => void; complete: (task: Task) => void; reopen: (task: Task) => void; remove: (task: Task) => void;
}) {
  // Include undated tasks captured by text in the initial view.
  const [view, setView] = useState<TaskView>("All");
  const due = (task: Task) => task.dueAt ? localDay(new Date(task.dueAt), data.timezone) : null;
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);
  const active = data.tasks.filter(task => !["completed", "abandoned"].includes(task.status));
  const completedCount = data.tasks.filter(task => task.status === "completed").length;
  const undated = active.filter(task => !task.dueAt);
  const matches = (task: Task) => view === "Done"
    ? task.status === "completed"
    : !["completed", "abandoned"].includes(task.status) && (view === "All" || task.status === "in_progress" || Boolean(due(task) && due(task)! <= (view === "Today" ? today : weekEnd)));
  const shown = data.tasks.filter(matches).sort((a, b) => (a.dueAt ?? "z").localeCompare(b.dueAt ?? "z"));
  const groups = view === "Done" ? [{ label: "Completed", icon: <FiCheckCircle />, tone: "done", tasks: shown }] : [
    { label: "In progress", icon: <FiPlay />, tone: "focus", tasks: shown.filter(task => task.status === "in_progress") },
    { label: "Past due", icon: <FiArrowUpRight />, tone: "carry", tasks: shown.filter(task => task.status !== "in_progress" && due(task) && due(task)! < today) },
    { label: "Today", icon: <FiSun />, tone: "today", tasks: shown.filter(task => task.status !== "in_progress" && due(task) === today) },
    { label: "Coming up", icon: <FiClock />, tone: "upcoming", tasks: shown.filter(task => task.status !== "in_progress" && due(task) && due(task)! > today) },
    { label: "No date yet", icon: <FiInbox />, tone: "undated", tasks: shown.filter(task => task.status !== "in_progress" && !due(task)) },
  ];

  return <div className={`${s.planning} ${s.taskSheet}`}>
    <div className={s.toolbar}>
      <div className={s.tabs} role="group" aria-label="To-do view">
        {(["All", "Today", "Next 7 days", "Done"] as const).map(option => <button key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>)}
      </div>
      <button className={s.addButton} disabled={saving} onClick={() => edit()}><FiPlus aria-hidden="true" /> Add to-do</button>
    </div>
    {data.tasksTruncated && <p role="status">Showing up to 200 tasks, with active tasks first. Ask Tempo to find older completed items.</p>}
    <div className={s.listSummary} aria-live="polite">
      <span><strong>{shown.length}</strong> {view === "Done" ? "completed" : "open"} {shown.length === 1 ? "task" : "tasks"}</span>
      {view !== "Done" && completedCount > 0 ? <button className={s.completedLink} onClick={() => setView("Done")}><FiCheckCircle aria-hidden="true" />{completedCount} completed<FiArrowUpRight aria-hidden="true" /></button> : <span>Tap a task to edit it</span>}
    </div>
    {groups.filter(group => group.tasks.length).map(group => <section className={s.taskGroup} data-tone={group.tone} key={group.label} aria-label={group.label}>
      <h2><span className={s.groupIcon} aria-hidden="true">{group.icon}</span>{group.label}<span className={s.groupCount}>{group.tasks.length}</span>{group.tone !== "done" && group.tasks.every(task => Boolean(task.estimatedMinutes)) && <span className={s.groupEstimate}><FiClock aria-hidden="true" />{group.tasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0)} min estimated</span>}</h2>
      <ul className={s.checklist}>
        {group.tasks.map(task => <li className={`${s.task} ${task.status === "completed" ? s.finished : ""}`} key={task.id}>
          <button className={s.checkbox} disabled={saving} aria-label={task.status === "completed" ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => task.status === "completed" ? reopen(task) : complete(task)}><span>{task.status === "completed" && <FiCheck aria-hidden="true" />}</span></button>
          <button className={s.taskTitle} disabled={saving} onClick={() => edit(task)} aria-label={`Edit ${task.title}`}>
            <strong>{task.title}</strong>
            <span>{task.dueAt ? taskDueLabel(task.dueAt, data.timezone, due(task) !== today) : "Choose a date when you need one"}{task.estimatedMinutes ? <><i aria-hidden="true" /><FiClock aria-hidden="true" />{task.estimatedMinutes} min</> : null}{task.goalId && <span className={s.goalContext}><FiTarget aria-hidden="true" />{data.goals.find(goal => goal.id === task.goalId)?.title ?? "Goal step"}</span>}</span>
          </button>
          <div className={s.taskActions}>
            {!["completed", "abandoned"].includes(task.status) && <button className={s.focusButton} disabled={saving} onClick={() => start(task)} aria-label={`Focus on ${task.title}`}><FiPlay aria-hidden="true" /><span>Focus</span></button>}
            <button className={s.iconButton} disabled={saving} onClick={() => remove(task)} aria-label={`Remove ${task.title}`} title={`Remove ${task.title}`}><FiTrash2 aria-hidden="true" /></button>
          </div>
        </li>)}
      </ul>
    </section>)}
    {!shown.length && <div className={s.clearState}>
      <span className={s.emptyIcon} aria-hidden="true">{view === "Done" ? <FiCheckCircle /> : <FiSun />}</span>
      <h2>{view === "Done" ? "Your completed tasks go here" : view === "All" ? "Start with one small task" : view === "Today" ? "Nothing due today" : "Nothing due this week"}</h2>
      <p>{view === "Done" ? "Check off a task when it’s finished." : view === "All" ? "Add it here or send Tempo a text." : "Add a task, or look at the rest of your list."}</p>
      <div className={s.emptyActions}>
        {view !== "Done" && <button className={s.addButton} disabled={saving} onClick={() => edit()}><FiPlus aria-hidden="true" /> Add to-do</button>}
        {view !== "All" && <button className={s.textButton} onClick={() => setView("All")}>View all to-dos <FiArrowUpRight aria-hidden="true" /></button>}
      </div>
    </div>}
    {view !== "All" && view !== "Done" && undated.length > 0 && <button className={s.unscheduled} onClick={() => setView("All")}><FiInbox aria-hidden="true" />{undated.length} {undated.length === 1 ? "task has" : "tasks have"} no date yet<span>View all <FiArrowUpRight aria-hidden="true" /></span></button>}
  </div>;
}

export function GoalsView({ data, saving, edit, addStep, editStep, achieve, remove }: {
  data: Workspace; saving: boolean; edit: (goal?: Goal) => void; addStep: (id: string) => void;
  editStep: (task: Task) => void; achieve: (id: string) => void; remove: (goal: Goal) => void;
}) {
  const [showAchieved, setShowAchieved] = useState(false);
  const goals = data.goals.filter(goal => showAchieved ? goal.status === "completed" : goal.status !== "completed");
  const activeCount = data.goals.filter(goal => goal.status !== "completed").length;
  const achievedCount = data.goals.filter(goal => goal.status === "completed").length;

  return <div className={s.planning}>
    {data.goalsTruncated && <p role="status">Showing up to 100 goals, with active goals first. Ask Tempo to find older goals.</p>}
    <div className={s.toolbar}>
      <div className={s.tabs} role="group" aria-label="Goal view">
        <button aria-pressed={!showAchieved} onClick={() => setShowAchieved(false)}>In progress <span>{activeCount}</span></button>
        <button aria-pressed={showAchieved} onClick={() => setShowAchieved(true)}>Achieved <span>{achievedCount}</span></button>
      </div>
      <button className={s.addButton} disabled={saving} onClick={() => edit()}><FiPlus aria-hidden="true" /> New goal</button>
    </div>
    {goals.length > 0 ? <div className={s.goalGrid}>{goals.map(goal => {
      const tone = [...goal.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4;
      const linked = data.tasks.filter(task => task.goalId === goal.id);
      const done = linked.filter(task => task.status === "completed").length;
      const next = linked.find(task => task.status === "in_progress") ?? linked.find(task => !["completed", "abandoned"].includes(task.status));
      const completed = goal.status === "completed";
      const readyToAchieve = !completed && linked.length > 0 && done === linked.length;

      return <article className={s.goal} data-tone={tone} key={goal.id}>
        <div className={s.goalHeader}>
          <Image className={s.goalLandscape} src="/images/goal-path.png" alt="" fill sizes="(max-width: 760px) 100vw, (min-width: 1600px) 33vw, 50vw" />
          <span className={s.goalIcon} aria-hidden="true">{completed ? <FiCheckCircle /> : <FiFlag />}</span>
          <span className={s.goalLabel}>{completed ? "Achieved" : "Long-term goal"}</span>
          <button className={s.editGoal} disabled={saving} aria-label={`Edit ${goal.title}`} onClick={() => edit(goal)}><FiEdit2 aria-hidden="true" /><span>Edit</span></button>
        </div>
        <div className={s.goalBody}>
          <h2>{goal.title}</h2>
          {goal.description && <p className={s.goalDescription}>{goal.description}</p>}
          {linked.length > 0 && <div className={s.goalProgress}>
            <div className={s.progressHeading}><span>{done} of {linked.length} steps complete</span><FiTarget aria-hidden="true" /></div>
            <progress aria-label={`${goal.title} linked steps complete`} value={done} max={linked.length} />
          </div>}
          <div className={s.nextStep}>
            <span className={s.kicker}>{completed ? "You made it" : "Next small step"}</span>
            {!completed && next ? <button disabled={saving} onClick={() => editStep(next)}><span>{next.title}</span><FiArrowUpRight aria-hidden="true" /></button> : <p>{completed ? "Keep this here as a reminder of what you’ve done." : linked.length ? "All steps finished. Ready to mark this goal achieved?" : "Add one task that moves this forward."}</p>}
          </div>
          {readyToAchieve && <button className={s.goalAdd} disabled={saving} onClick={() => achieve(goal.id)}><FiCheck aria-hidden="true" /> Mark achieved</button>}
          {!completed && <button className={readyToAchieve ? s.textButton : s.goalAdd} disabled={saving} onClick={() => addStep(goal.id)}><FiPlus aria-hidden="true" /> Add a step</button>}
          <details className={s.goalDetails}>
            <summary>Steps & goal options</summary>
            {linked.length > 0 ? <ul className={s.milestones}>{linked.map(task => <li key={task.id}><button disabled={saving} onClick={() => editStep(task)}><span aria-hidden="true">{task.status === "completed" ? <FiCheckCircle /> : <FiTarget />}</span><span>{task.title}</span><span className={s.stepStatus}>{task.status === "completed" ? "Done" : "Edit"}</span></button></li>)}</ul> : <p>No steps added yet.</p>}
            <div className={s.goalOptions}>
              {!completed && !readyToAchieve && <button className={s.achieve} disabled={saving} onClick={() => achieve(goal.id)}><FiCheck aria-hidden="true" /> Mark achieved</button>}
              <button className={s.removeGoal} disabled={saving} onClick={() => remove(goal)}><FiTrash2 aria-hidden="true" /> Remove goal</button>
            </div>
          </details>
        </div>
      </article>;
    })}</div> : <div className={s.clearState}>
      <span className={s.emptyIcon} aria-hidden="true">{showAchieved ? <FiCheckCircle /> : <FiFlag />}</span>
      <h2>{showAchieved ? "A place for your achievements" : "What would you like to work toward?"}</h2>
      <p>{showAchieved ? "Goals you mark achieved will appear here." : "Choose a longer-term goal. Then start with one small step."}</p>
      {showAchieved ? <button className={s.textButton} onClick={() => setShowAchieved(false)}>View current goals <FiArrowUpRight aria-hidden="true" /></button> : <button className={s.addButton} disabled={saving} onClick={() => edit()}><FiPlus aria-hidden="true" /> New goal</button>}
    </div>}
  </div>;
}

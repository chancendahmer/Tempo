"use client";
import { useState } from "react";
import Link from "next/link";
import { FiArrowRight, FiBell, FiCalendar, FiCheck, FiCheckSquare, FiClock, FiEdit3, FiMoon, FiPlay, FiPlus, FiSun } from "react-icons/fi";
import { localDay, type SavedLifeItem } from "../../server/domain/life-items";
import type { Workspace } from "./workspace-data";
import { useCalendarEvents } from "./use-calendar-events";
import { todayModel } from "./today-model";
import { TodayProgress } from "./TodayProgress";
import { taskDueLabel } from "./task-due-label";
import s from "./today.module.css";
import ui from "./workspace.module.css";

type Props = {
  preview?: boolean; data: Workspace; now: Date; saving: boolean;
  go: (section: "calendar" | "tasks" | "routines" | "reminders") => void;
  editTask: (task?: Workspace["tasks"][number]) => void;
  startTask: (task: Workspace["tasks"][number]) => void;
  completeTask: (task: Workspace["tasks"][number]) => void;
  checkStep: (item: SavedLifeItem, stepId: string) => void;
  startStep: (item: SavedLifeItem, stepId: string) => void;
  editRoutine: (item?: SavedLifeItem) => void;
  ask: (text: string) => void;
  onResumeFocus?: () => void;
  onSetup: () => void;
};
export function TodayView({ data, preview = false, now, saving, go, editTask, startTask, completeTask, checkStep, startStep, editRoutine, ask, onResumeFocus, onSetup }: Props) {
  const [tab, setTab] = useState<"routine" | "todo" | null>(null);
  const calendar = useCalendarEvents(data, localDay(now, data.timezone), preview);
  const model = todayModel(data, now, calendar.events);
  const selected = tab ?? (model.activeRoutine ? "routine" : "todo");
  const routine = model.routine;
  const nextRoutineStep = routine?.data.steps.find(step => step.completedOn !== model.day);
  const active = model.nextTask?.status === "in_progress" ? undefined : model.activeRoutine;
  const step = active?.data.steps.find(step => step.completedOn !== model.day);
  const task = model.nextTask;
  const dueLabel = (task: Workspace["tasks"][number]) => task.dueAt ? `${localDay(new Date(task.dueAt), data.timezone) < model.day ? "Overdue · " : ""}${taskDueLabel(task.dueAt, data.timezone, true)}` : "";
  const focus = model.focus;
  const hasOngoingFocus = Boolean(focus || task?.status === "in_progress");
  const currentCalendar = !hasOngoingFocus ? model.events.find(event => event.kind === "calendar" && event.ongoing) : undefined;
  const isFocusedStep = (id: string) => Boolean(focus && focus.routineId === routine?.id && focus.stepId === id);
  const time = (value: string | Date) => new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const displayedTaskId = focus?.taskId ?? (!focus && !active && !currentCalendar ? task?.id : undefined);
  const events = model.events.filter(e => !(e.kind === "task" && displayedTaskId === e.id));
  const currentEvents = events.filter(e => e.ongoing);
  const allDayEvents = events.filter(e => e.allDay);
  const future = events.filter(e => !e.allDay && !e.ongoing && Date.parse(e.at) >= now.getTime());
  const earlier = events.filter(e => !e.allDay && !e.ongoing && Date.parse(e.at) < now.getTime());
  const eventRow = (e: typeof events[number]) => <button key={`${e.kind}-${e.id}`} className={s.timelineRow} data-kind={e.kind} onClick={() => e.kind === "task" ? editTask(data.tasks.find(t => t.id === e.id)) : go(e.kind === "calendar" ? "calendar" : "reminders")}>
    <time>{e.allDay ? "All day" : time(e.at)}</time><span className={s.dot} /><span className={s.eventBody} data-kind={e.kind}><span className={s.icon} aria-hidden="true">{e.kind === "calendar" ? <FiCalendar /> : e.kind === "reminder" ? <FiBell /> : <FiCheckSquare />}</span><span><strong>{e.title}</strong><small>{e.ongoing && e.endsAt ? `Happening now · until ${time(e.endsAt)}` : e.detail}</small></span><FiArrowRight className={s.rowArrow} aria-hidden="true" /></span>
  </button>;
  return <>
    <header className={s.heading}><div><h1>Your {new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: data.timezone }).format(now)}</h1><p>{new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric", timeZone: data.timezone }).format(now)}</p></div><time>{time(now)}</time></header>
    <TodayProgress data={data} preview={preview} onSetup={onSetup} onAsk={() => ask("Help me choose one small thing to start with from my current tasks. Just suggest it for now.")} />
    <div className={s.layout}>
      <section aria-labelledby="today-heading" className={s.day}><div className={s.sectionHeading}><h2 id="today-heading"><span className={s.headingIcon} aria-hidden="true"><FiCalendar /></span>Today</h2><button className={ui.textButton} onClick={() => go("calendar")}>View calendar <FiArrowRight /></button></div>
        {calendar.disconnected && <p className={s.calendarHint}><FiCalendar aria-hidden="true" /><span><Link className={ui.textButton} href="/extensions">Connect Google Calendar</Link> to see events beside your tasks.</span></p>}
        {!preview && calendar.loading && <p role="status" className={ui.muted}>Refreshing your calendar…</p>}
        {!preview && calendar.error && <p role="status" className={ui.foodNotice}>Calendar details couldn’t refresh. <button className={ui.textButton} onClick={() => go("calendar")}>Check connection</button></p>}
        {calendar.truncated && <p role="status" className={ui.foodNotice}>More calendar events are available. <button className={ui.textButton} onClick={() => go("calendar")}>View full schedule</button></p>}
        <div className={s.timeline}>
          {allDayEvents.map(eventRow)}
          <div className={`${s.timelineRow} ${s.current}`}><time><b>NOW</b>{time(now)}</time><span className={s.dot} /><div className={s.currentBody}><span className={s.icon} aria-hidden="true" data-tone={currentCalendar ? "blue" : active ? "amber" : "lavender"}>{currentCalendar ? <FiCalendar /> : focus ? <FiClock /> : active ? active.data.period === "morning" ? <FiSun /> : <FiMoon /> : <FiEdit3 />}</span><div className={s.currentText}><h3>{currentCalendar?.title ?? focus?.title ?? active?.data.title ?? task?.title ?? "What would you like to do?"}</h3><p>{currentCalendar ? `Happening now · until ${time(currentCalendar.endsAt!)}` : focus ? !focus.endsAt ? "Focus paused. Continue when you’re ready." : Date.parse(focus.endsAt) <= now.getTime() ? "Time is up. Check in when you’re ready." : "Your focus session is in progress." : step ? `Next: ${step.title}` : task ? task.dueAt ? dueLabel(task) : "One small step is enough." : "Add one task to get started."}</p></div><div className={s.start}><button className={ui.primary} disabled={saving || Boolean(focus && !onResumeFocus)} onClick={() => currentCalendar ? go("calendar") : focus ? onResumeFocus?.() : active && step ? startStep(active, step.id) : task ? startTask(task) : editTask()}>{currentCalendar ? <FiCalendar /> : !focus && !active && !task ? <FiPlus /> : <FiPlay />}{currentCalendar ? "View calendar" : focus ? "Continue focus" : task?.status === "in_progress" && !active ? "Continue" : active && step ? `Start ${step.minutes} minutes` : task ? `Start ${task.estimatedMinutes ?? 25} minutes` : "Add a task"}</button>{task && !active && !focus && !currentCalendar && <button className={ui.textButton} onClick={() => ask(`Help me break “${task.title}” into a smaller next step.`)}>Make it smaller</button>}</div></div></div>
          {currentEvents.filter(event => event.id !== currentCalendar?.id).map(eventRow)}
          {future.length > 0 && <p className={s.dayPart}><FiClock aria-hidden="true" />Later today<span>{future.length} planned</span></p>}
          {future.slice(0, 3).map(eventRow)}
          {!future.length && !currentEvents.length && !allDayEvents.length && !calendar.loading && !calendar.error && !calendar.truncated && <p className={s.freeTime}>{calendar.disconnected ? "No other tasks or reminders scheduled today." : "Nothing else scheduled today. A little room to breathe."}</p>}
        </div>
        {(earlier.length > 0 || future.length > 3) && <details className={s.more}><summary>More of your day ({earlier.length + Math.max(0, future.length - 3)})</summary>{earlier.length > 0 && <h3>Earlier today</h3>}{earlier.map(eventRow)}{future.slice(3).map(eventRow)}</details>}
      </section>
      <aside className={s.side}><div className={s.tabs} role="group" aria-label="Today checklist"><button aria-pressed={selected === "routine"} onClick={() => setTab("routine")}><FiSun aria-hidden="true" />Routine</button><button aria-pressed={selected === "todo"} onClick={() => setTab("todo")}><FiCheckSquare aria-hidden="true" />To-do</button></div>
        {selected === "routine" ? routine ? <><div className={s.routineTitle}><span className={s.routineEmblem} data-period={routine.data.period} aria-hidden="true">{routine.data.period === "morning" ? <FiSun /> : <FiMoon />}</span><h2>{routine.data.title}</h2><small>{routine.data.steps.filter(step => step.completedOn === model.day).length} of {routine.data.steps.length} done</small><progress aria-label="Routine progress" max={Math.max(1, routine.data.steps.length)} value={routine.data.steps.filter(step => step.completedOn === model.day).length} /></div><div className={s.checklist}>{routine.data.steps.map(step => <div key={step.id} className={s.checkRow} data-next={nextRoutineStep?.id === step.id}><button className={`${ui.check} ${step.completedOn === model.day ? ui.checked : ""}`} disabled={saving} aria-label={`${step.completedOn === model.day ? "Uncheck" : "Complete"} ${step.title}`} aria-pressed={step.completedOn === model.day} onClick={() => checkStep(routine, step.id)}>{step.completedOn === model.day && <FiCheck />}</button><span>{step.title}{step.completedOn !== model.day && <small>{nextRoutineStep?.id === step.id ? "Next · " : ""}{step.minutes} min</small>}</span>{step.completedOn !== model.day && <button className={ui.iconButton} aria-label={`${isFocusedStep(step.id) ? "Continue" : "Start"} ${step.title}`} disabled={saving || (hasOngoingFocus && !isFocusedStep(step.id)) || (isFocusedStep(step.id) && !onResumeFocus)} onClick={() => isFocusedStep(step.id) ? onResumeFocus?.() : startStep(routine, step.id)}><FiPlay /></button>}</div>)}</div><button className={ui.textButton} onClick={() => editRoutine(routine)}>Edit routine</button><button className={ui.textButton} onClick={() => go("routines")}>All routines <FiArrowRight /></button></> : <div className={s.blank}><FiSun /><h2>Your own rhythm</h2><p>A few steps for the start or end of your day.</p><button className={ui.primary} onClick={() => editRoutine()}>Create a routine</button></div> : <><div className={s.routineTitle}><span className={`${s.routineEmblem} ${s.todoEmblem}`} aria-hidden="true"><FiCheckSquare /></span><h2>A few things to do</h2><small>{model.tasks.length} open · at your pace</small></div><div className={s.checklist}>{model.tasks.slice(0, 5).map(t => <div className={s.checkRow} key={t.id} data-next={t.id === task?.id}><button className={ui.check} aria-label={`Complete ${t.title}`} disabled={saving} onClick={() => completeTask(t)} /><button className={s.taskLabel} onClick={() => editTask(t)}><strong>{t.title}</strong><small>{t.estimatedMinutes ? `${t.estimatedMinutes} min` : "No time estimate"}{t.dueAt ? ` · ${dueLabel(t)}` : ""}</small></button></div>)}</div>{!model.tasks.length && <p className={s.blank}>Your list is clear.</p>}<button className={ui.textButton} onClick={() => editTask()}><FiPlus /> Add a task</button><button className={ui.textButton} onClick={() => go("tasks")}>View all tasks <FiArrowRight /></button></>}
      </aside>
    </div>
  </>;
}

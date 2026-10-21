"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FiArrowRight, FiCalendar, FiCheck, FiChevronRight, FiFileText, FiHome, FiMoon, FiPlay, FiPlus, FiSettings, FiShoppingCart, FiSun, FiUser, FiX } from "react-icons/fi";
import { LuCarrot, LuDumbbell, LuPin, LuPinOff } from "react-icons/lu";
import { localDay, type SavedLifeItem } from "../../server/domain/life-items";
import { taskCategoryLabels, taskPresentation, type TaskCategory } from "../../server/domain/task-presentation";
import type { HomeMode, HomePreferences } from "../../server/domain/home-preferences";
import type { Workspace } from "./workspace-data";
import type { Section } from "./WorkspaceNavigation";
import { useCalendarEvents } from "./use-calendar-events";
import { homeModel } from "./home-model";
import { taskDueLabel } from "./task-due-label";
import s from "./adaptive-home.module.css";

type Task = Workspace["tasks"][number];
type Props = {
  preview?: boolean; data: Workspace; now: Date; saving: boolean;
  go: (section: Section) => void; editTask: (task?: Task) => void;
  startTask: (task: Task) => void; completeTask: (task: Task) => void;
  checkStep: (item: SavedLifeItem, stepId: string) => void;
  startStep: (item: SavedLifeItem, stepId: string) => void;
  editRoutine: (item?: SavedLifeItem) => void; ask: (text: string) => void;
  onResumeFocus?: () => void; onSetup: () => void;
  motion: boolean; setMotion: (value: boolean) => void;
  saveHome?: (preferences: HomePreferences) => Promise<boolean>;
  saveTaskStyle?: (task: Task, category: TaskCategory, minutes: number) => Promise<boolean>;
};
const icons = { work: FiFileText, shopping: FiShoppingCart, food: LuCarrot, fitness: LuDumbbell, home: FiHome, personal: FiUser };
const modes = { morning: "Morning", focus: "Focus", meal: "Meal plan", workout: "Workout", evening: "Wind-down" };
export function TodayView({ data, preview = false, now, saving, go, editTask, startTask, completeTask, startStep, editRoutine, onResumeFocus, saveHome, saveTaskStyle }: Props) {
  const [manual, setManual] = useState<HomeMode>();
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState(false);
  const [styleTask, setStyleTask] = useState<Task | null>(null);
  const [formError, setFormError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const calendar = useCalendarEvents(data, localDay(now, data.timezone), preview);
  const model = homeModel(data, now, calendar.events, manual);
  const hero = model.hero;
  const hasFocus = !!(model.today.focus || model.tasks.some(task => task.status === "in_progress"));
  const close = () => { dialog.current?.close(); setSettings(false); setStyleTask(null); setFormError(""); opener.current?.focus(); };
  useEffect(() => {
    if (settings || styleTask) {
      opener.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    }
  }, [settings, styleTask]);
  const time = (value: string | Date) => new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const actOnHero = () => {
    if (hero.ongoingFocus) { onResumeFocus?.(); return; }
    if (hero.routine?.data.kind === "routine") {
      const step = hero.routine.data.steps.find(step => step.completedOn !== model.day);
      if (step && !hasFocus) startStep(hero.routine, step.id);
      else go("routines");
    } else if (hero.destination === "routines") editRoutine();
    else if (hero.destination === "tasks") { if (hero.task) startTask(hero.task); else editTask(); }
    else go(hero.destination);
  };
  const HeroIcon = hero.mode === "morning" ? FiSun : hero.mode === "evening" ? FiMoon : hero.mode === "workout" ? LuDumbbell : hero.mode === "meal" ? LuCarrot : FiFileText;
  const persistHome = async (preferences: HomePreferences) => {
    if (!saveHome) return;
    if (await saveHome(preferences)) { setManual(undefined); close(); }
    else setFormError("Your changes couldn’t be saved. Please try again.");
  };
  return <div className={s.home}>
    <div className={s.greeting}><div><h1>{model.greeting}{data.profile.displayName ? `, ${data.profile.displayName.split(" ")[0]}` : ""}.</h1><p>{new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, weekday: "long", month: "long", day: "numeric" }).format(now)}<span>·</span>{time(now)}</p></div><button className={s.pill} aria-label="Customize home" onClick={() => setSettings(true)}><FiSettings /> <span>Customize home</span></button></div>
    <section className={s.hero} data-mode={model.mode} aria-label="Your current activity">
      <Image key={hero.image} className={s.heroImage} src={hero.image} alt={hero.imageAlt} fill sizes="(max-width: 760px) 100vw, 1200px" priority />
      <div className={s.heroShade} />
      <div className={s.heroControls}>
        <label><span className={s.srOnly}>Home banner</span><select value={manual ?? model.preferences.pinned} onChange={event => setManual(event.target.value as HomeMode)}><option value="auto">Auto · {modes[model.automatic]}</option>{Object.entries(modes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <button className={s.iconButton} disabled={saving || !saveHome} aria-label={model.preferences.pinned === model.mode ? "Unpin home banner" : "Pin this home banner"} aria-pressed={model.preferences.pinned === model.mode} onClick={() => void persistHome({ ...model.preferences, pinned: model.preferences.pinned === model.mode ? "auto" : model.mode })}>{model.preferences.pinned === model.mode ? <LuPinOff /> : <LuPin />}</button>
      </div>
      <div className={s.heroContent}><HeroIcon className={s.heroIcon} aria-hidden="true" /><div><p className={s.eyebrow}>{hero.label}</p><h2>{hero.title}</h2><p className={s.heroDetail}>{hero.detail}</p>
        {hero.total !== undefined && <div className={s.progress}><progress max={Math.max(1, hero.total)} value={hero.completed} aria-label="Routine progress" /><span>{hero.completed} of {hero.total} done</span></div>}
        <div className={s.heroActions}><button className={s.primary} disabled={saving} onClick={actOnHero}>{hero.action}<FiArrowRight /></button><button className={s.textButton} onClick={() => hero.routine ? editRoutine(hero.routine) : hero.mode === "meal" ? go("groceries") : hero.mode === "workout" ? go("movement") : setSettings(true)}>{hero.routine ? "Edit routine" : hero.mode === "meal" ? "Ingredients & groceries" : hero.mode === "workout" ? "Your fitness plans" : "Adjust your schedule"} <FiArrowRight /></button></div>
      </div></div>
    </section>
    <div className={s.columns}>
      <section className={s.todos} aria-labelledby="home-tasks"><div className={s.sectionHeading}><h2 id="home-tasks">Your to-do</h2><button className={s.pill} onClick={() => editTask()} disabled={saving}><FiPlus />Add task</button></div>
        {model.tasks.slice(0, expanded ? undefined : 3).map(task => {
          const presentation = taskPresentation(task), Icon = icons[presentation.category];
          const active = task.status === "in_progress";
          return <div className={s.task} key={task.id} data-active={active}>
            <button className={s.check} aria-label={`Complete ${task.title}`} disabled={saving} onClick={() => completeTask(task)}><FiCheck /></button>
            <div className={s.taskBody}><button className={s.taskTitle} onClick={() => editTask(task)}>{task.title}</button><div className={s.taskMeta}><button data-category={presentation.category} aria-label={`Customize icon and starting timer for ${task.title}`} title={`${presentation.source === "ai" ? "AI suggestion" : presentation.source === "manual" ? "Your choice" : "Default suggestion"}: ${taskCategoryLabels[presentation.category]}, ${presentation.focusMinutes} minutes`} onClick={() => setStyleTask(task)} disabled={active}><Icon aria-hidden="true" /></button><span>{active ? "In progress" : task.dueAt ? `${localDay(new Date(task.dueAt), data.timezone) < model.day ? "Overdue · " : ""}${taskDueLabel(task.dueAt, data.timezone, true)}` : "Anytime"}</span></div></div>
            <button className={s.start} aria-label={`${active ? "Continue" : `Start ${presentation.focusMinutes} minute timer for`} ${task.title}`} disabled={saving || (hasFocus && !active)} onClick={() => active && onResumeFocus ? onResumeFocus() : startTask(task)}><FiPlay />{active ? "Continue" : `Start ${presentation.focusMinutes} min`}</button><button className={s.chevron} onClick={() => editTask(task)} aria-label={`Edit ${task.title}`}><FiChevronRight /></button>
          </div>;
        })}
        {!model.tasks.length && <div className={s.empty}><FiCheck /><h3>A little room to begin.</h3><p>Add one thing you’d like to get to. It doesn’t need a time.</p><button className={s.textButton} onClick={() => editTask()}>Add your first task <FiPlus /></button></div>}
        {data.tasksTruncated && <p className={s.notice}>Showing your first 200 tasks. Open To-do to manage your list.</p>}
        <div className={s.listFooter}>{model.tasks.length > 3 && <button className={s.textButton} onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : `Show ${model.tasks.length - 3} more`}</button>}<button className={s.textButton} onClick={() => go("tasks")}>All to-dos <FiArrowRight /></button></div>
      </section>
      <section className={s.calendar} aria-labelledby="home-calendar"><div className={s.sectionHeading}><h2 id="home-calendar">On your calendar</h2><button className={s.textButton} onClick={() => go("calendar")}>View calendar <FiArrowRight /></button></div>
        <p className={s.calendarCaption}><FiCalendar /> Today · {new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, month: "short", day: "numeric" }).format(now)}</p>
        {calendar.disconnected && <p className={s.notice}><Link href="/extensions">Connect Google Calendar</Link> to see today’s events here.</p>}
        {calendar.error && <p className={s.notice} role="status">Calendar couldn’t refresh. <button onClick={() => go("calendar")}>Check connection</button></p>}
        {calendar.loading && !preview && <p role="status" className={s.notice}>Refreshing your calendar…</p>}
        {model.calendar.slice(0, 3).map((event, index) => {
          const at = event.start.dateTime, end = event.end.dateTime;
          const delta = at ? Math.ceil((Date.parse(at) - now.getTime()) / 60000) : null;
          const ongoing = delta !== null && delta <= 0 && end && Date.parse(end) > now.getTime();
          const duration = at && end ? Math.round((Date.parse(end) - Date.parse(at)) / 60000) : null;
          return <button className={s.event} data-next={index === 0} key={event.id} onClick={() => go("calendar")}><span className={s.eventDot} /><span className={s.eventIcon}><FiCalendar /></span><span className={s.eventText}><strong>{at ? time(at) : "All day"}{index === 0 && <small>{ongoing ? "Now" : delta !== null && delta > 0 ? delta < 60 ? `In ${delta} min` : `In ${Math.floor(delta / 60)}h` : "Today"}</small>}</strong><span>{event.title}</span><small>{duration ? `${duration} min · ` : ""}{preview ? "Sample calendar" : "Google Calendar"}</small></span><FiChevronRight /></button>;
        })}
        {!model.calendar.length && !calendar.loading && !calendar.disconnected && !calendar.error && <div className={s.empty}><FiCalendar /><h3>No more events today.</h3><p>Your open time is yours.</p></div>}
        {(calendar.truncated || model.calendar.length > 3) && <button className={s.textButton} onClick={() => go("calendar")}>View the rest of today <FiArrowRight /></button>}
        {!!model.today.events.filter(event => event.kind === "reminder").length && <button className={s.textButton} onClick={() => go("reminders")}>Your reminders <FiArrowRight /></button>}
      </section>
    </div>
    <div className={s.homeFooter}><span>{model.preferences.pinned === "auto" ? manual && manual !== "auto" ? "Previewing this banner. Pin it to keep it." : "Your home changes with your day." : `${modes[model.preferences.pinned]} banner pinned. Your tasks and calendar stay current.`}</span><button className={s.textButton} onClick={() => setSettings(true)}>Make it yours <FiSettings /></button></div>
    <dialog ref={dialog} className={s.dialog} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="home-dialog-title">
      <div className={s.sectionHeading}><h2 id="home-dialog-title">{styleTask ? "A starting point that fits." : "Your home, your rhythm."}</h2><button className={s.iconButton} aria-label="Close settings" onClick={close}><FiX /></button></div>
      {settings && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void persistHome({ morningTime: String(form.get("morningTime")) || null, dinnerTime: String(form.get("dinnerTime")), eveningTime: String(form.get("eveningTime")) || null, workoutLeadMinutes: Number(form.get("workoutLeadMinutes")), pinned: String(form.get("pinned")) as HomeMode }); }}><p>Only the banner changes. Your to-do list and today’s calendar stay in place.</p><div className={s.formGrid}><label>Morning starts<input type="time" name="morningTime" defaultValue={model.preferences.morningTime ?? ""} /></label><label>Dinner time<input type="time" name="dinnerTime" required defaultValue={model.preferences.dinnerTime} /></label><label>Wind-down starts<input type="time" name="eveningTime" defaultValue={model.preferences.eveningTime ?? ""} /></label><label>Show workout beforehand (minutes)<input type="number" name="workoutLeadMinutes" min="0" max="120" required defaultValue={model.preferences.workoutLeadMinutes} /></label></div><p className={s.help}>Times use {data.timezone}. Leave morning or wind-down blank to follow your routine’s saved time. Workouts appear near scheduled fitness tasks or calendar events.</p><label>Banner mode<select name="pinned" defaultValue={model.preferences.pinned}><option value="auto">Automatic · follow my day</option>{Object.entries(modes).map(([key, label]) => <option key={key} value={key}>{label} · pinned</option>)}</select></label><button className={s.primary} disabled={saving || !saveHome} type="submit">Save preferences <FiCheck /></button></form>}
      {styleTask && <form key={styleTask.id} onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); if (saveTaskStyle && await saveTaskStyle(styleTask, String(form.get("category")) as TaskCategory, Number(form.get("minutes")))) close(); else setFormError("This task changed or couldn’t be saved. Refresh and try again."); }}><p>{styleTask.title}</p><label>Task icon<select name="category" defaultValue={taskPresentation(styleTask).category}>{Object.entries(taskCategoryLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Starting timer (minutes)<input name="minutes" type="number" min="1" max="60" required defaultValue={taskPresentation(styleTask).focusMinutes} /></label><p className={s.help}>A short starting session, not a deadline or a promise about how long the whole task will take. Tempo can suggest an icon and timer; your choice takes priority.</p><button className={s.primary} disabled={saving || !saveTaskStyle} type="submit">Save my choice <FiCheck /></button></form>}
      {formError && <p role="alert" className={s.notice}>{formError}</p>}
    </dialog>
  </div>;
}

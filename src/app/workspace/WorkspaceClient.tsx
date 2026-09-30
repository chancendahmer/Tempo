"use client";

import Link from "next/link";
import Image from "next/image";
import { SectionArt, MealIllustration } from "./SectionArt";
import { FoodSearch } from "./FoodSearch";
import { TasksView, GoalsView } from "./PlanningViews";
import { CalendarView } from "./CalendarView";
import { agendaDateLabel } from "./agenda-date-label";
import { taskDueLabel } from "./task-due-label";
import { ChatMessage } from "./ChatMessage";
import { WakeExperience } from "./WakeExperience";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiBookOpen, FiCalendar, FiCheck, FiCheckCircle, FiClock, FiCoffee, FiEdit2, FiGrid, FiHeart, FiInbox, FiMaximize, FiMenu, FiMessageCircle, FiMoon, FiMoreHorizontal, FiPause, FiPlay, FiPlus, FiSend, FiSettings, FiShoppingBag, FiSun, FiTarget, FiTrash2, FiX, FiZap } from "react-icons/fi";
import { lifeItemSchema, localDay, type LifeItem, type SavedLifeItem } from "@/server/domain/life-items";
import type { WorkspaceAction } from "@/server/db/repositories/workspace-repository";
import { previewWorkspace, type Workspace } from "./workspace-data";
import s from "./workspace.module.css";

const sections = [
  ["today", "Today", FiGrid], ["tasks", "Tasks & focus", FiCheckCircle], ["goals", "Goals", FiTarget], ["calendar", "Calendar", FiCalendar],
  ["routines", "My routines", FiSun], ["meals", "Meal planner", FiCoffee], ["nutrition", "Food & nutrition", FiHeart], ["movement", "Movement", FiZap],
  ["inbox", "Thought inbox", FiInbox], ["assistant", "Ask Tempo", FiMessageCircle], ["wake", "Wake & Wind Down", FiSun], ["settings", "Settings", FiSettings],
] as const;
type Section = typeof sections[number][0];
type Field = { name: string; label: string; type?: string; value?: string | number; options?: string[]; required?: boolean; min?: number; max?: number };
type Editor = { title: string; subtitle: string; fields: Field[]; submit: (values: Record<string, string>) => Promise<boolean> };
type FocusData = Extract<LifeItem, { kind: "focus" }>;

export function WorkspaceClient({ preview = false }: { preview?: boolean }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [section, setSection] = useState<Section>("today");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [foodSearch, setFoodSearch] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [mobile, setMobile] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [draft, setDraft] = useState("");
  const [focusHidden, setFocusHidden] = useState(false);
  const [hidden, setHidden] = useState(false);
  const busyRef = useRef(false);
  const requestSequence = useRef(0);
  const previewInitialized = useRef(false);
  const fastPollUntil = useRef(0);
  const lastPoll = useRef(0);
  const polling = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const focusDialog = useRef<HTMLDialogElement>(null);
  const chatRequest = useRef<{ text: string; id: string } | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (preview) return;
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch("/api/account/workspace", { cache: "no-store" });
      const body = await response.json();
      if (sequence !== requestSequence.current) return;
      if (!response.ok) { setData(null); setError(body.error ?? "Could not open your workspace."); return; }
      const pending = (body as Workspace).messages.filter(message => message.direction === "inbound" && ["received", "processing"].includes(message.status));
      fastPollUntil.current = pending.reduce((latest, message) => Math.max(latest, new Date(message.createdAt).getTime() + 120_000), 0);
      setData(body); setError("");
    } catch { if (sequence === requestSequence.current) { setData(null); setError("You’re offline. Reconnect to open your saved workspace."); } }
  }, [preview]);

  useEffect(() => {
    const sequenceRef = requestSequence;
    const initial = setTimeout(() => {
      if (preview && !previewInitialized.current) { setData(previewWorkspace()); previewInitialized.current = true; }
      else if (!preview) void refresh();
      setNow(new Date());
    }, 0);
    const poll = setInterval(() => {
      const timestamp = Date.now();
      const interval = fastPollUntil.current > timestamp ? 2_000 : 15_000;
      if (!preview && !busyRef.current && !polling.current && timestamp - lastPoll.current >= interval) {
        lastPoll.current = timestamp;
        polling.current = true;
        void refresh().finally(() => { polling.current = false; });
      }
    }, 2_000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(initial); clearInterval(poll); clearInterval(clock); sequenceRef.current++; window.speechSynthesis?.cancel(); };
  }, [preview, refresh]);
  useEffect(() => { if (editor) dialog.current?.showModal(); else dialog.current?.close(); }, [editor]);
  useEffect(() => { if (section === "assistant") chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [section, data?.messages.length]);

  const today = now ? localDay(now, data?.timezone ?? "UTC") : "";
  const date = selectedDate || today;
  const items = data?.items ?? [];
  const open = data?.tasks.filter(task => task.status !== "completed") ?? [];
  const completed = data?.tasks.filter(task => task.status === "completed") ?? [];
  const recipes = items.filter(item => item.data.kind === "recipe");
  const routines = items.filter(item => item.data.kind === "routine");
  const focusItem = items.find(item => item.data.kind === "focus");
  const ongoing = open.find(task => task.status === "in_progress");
  const focus: FocusData | null = focusItem?.data.kind === "focus" ? focusItem.data : ongoing ? { kind: "focus", title: ongoing.title, taskId: ongoing.id, remaining: (ongoing.estimatedMinutes ?? 25) * 60, endsAt: new Date(new Date(ongoing.startedAt ?? now ?? new Date()).getTime() + (ongoing.estimatedMinutes ?? 25) * 60_000).toISOString() } : null;
  const focusVisible = Boolean(focus && !focusHidden && !hidden && data);
  useEffect(() => { if (focusVisible) focusDialog.current?.showModal(); else focusDialog.current?.close(); }, [focusVisible]);
  const remaining = focus ? focus.endsAt && now ? Math.max(0, Math.ceil((new Date(focus.endsAt).getTime() - now.getTime()) / 1000)) : focus.remaining : 0;
  const foods = items.filter(item => item.data.kind === "food" && item.data.date === date);
  const totals = foods.reduce((acc, item) => { if (item.data.kind === "food") { acc.calories += item.data.calories ?? 0; acc.protein += item.data.protein ?? 0; acc.carbs += item.data.carbs ?? 0; acc.fat += item.data.fat ?? 0; acc.fiber += item.data.fiber ?? 0; } return acc; }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const time = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: data?.timezone ?? "UTC", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const go = (value: Section) => { setSection(value); setMobile(false); setNotice(""); };

  async function act(action: WorkspaceAction): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true; setSaving(true); requestSequence.current++;
    try {
      if (preview) {
        if (action.action === "chat") { setNotice("The preview doesn’t call AI or send messages. Log in to talk to your Tempo assistant."); return false; }
        setData(current => {
          if (!current) return current;
          const next = structuredClone(current);
          if (action.action === "save") {
            next.items = next.items.filter(item => item.id !== action.id);
            next.items.unshift({ id: action.id, version: action.version + 1, data: action.data });
          } else if (action.action === "delete") next.items = next.items.filter(item => item.id !== action.id);
          else if (action.action === "finish_focus") {
            const f = next.items.find(item => item.id === action.id);
            if (f?.data.kind === "focus") {
              const stepId = f.data.stepId, routineId = f.data.routineId;
              const r = next.items.find(item => item.id === routineId);
              if (r?.data.kind === "routine") r.data.steps = r.data.steps.map(step => step.id === stepId ? { ...step, completedOn: today } : step);
            }
            next.items = next.items.filter(item => item.id !== action.id);
          }
          else if (action.action === "checkins") next.profile.proactiveOptIn = action.enabled;
          else if (action.action === "task") {
            const c = action.command;
            if (c.type === "create_task") next.tasks.push({ id: crypto.randomUUID(), title: c.title, estimatedMinutes: c.estimatedMinutes ?? null, dueAt: c.dueAt ?? null, status: "not_started", startedAt: null, goalId: c.goalId ?? null });
            else if (c.type !== "list_tasks") {
              const task = next.tasks.find(item => item.id === c.taskId);
              if (task) {
                if (c.type === "update_task") Object.assign(task, c.patch);
                else if (c.type === "start_task") { task.status = "in_progress"; task.startedAt = new Date().toISOString(); }
                else if (c.type === "complete_task") { task.status = "completed"; next.items = next.items.filter(item => !(item.data.kind === "focus" && item.data.taskId === task.id)); }
                else next.tasks = next.tasks.filter(item => item.id !== task.id);
              }
            }
          } else if (action.action === "goal") {
            const c = action.command;
            if (c.type === "create_goal") next.goals.push({ id: crypto.randomUUID(), title: c.title, description: c.description ?? null, status: "active" });
            else if (c.type !== "list_goals") {
              const goal = next.goals.find(item => item.id === c.goalId);
              if (goal) { if (c.type === "update_goal") Object.assign(goal, c.patch); else if (c.type === "complete_goal") goal.status = "completed"; else next.goals = next.goals.filter(item => item.id !== goal.id); }
            }
          }
          return next;
        });
        setNotice("Updated in preview. Sample changes reset on reload."); return true;
      }
      const response = await fetch("/api/account/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const body = await response.json();
      if (!response.ok) { if (response.status === 401) setData(null); throw new Error(body.error ?? "Could not save. Please try again."); }
      await refresh(); setNotice(body.message ?? "Saved."); return true;
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not save. Your changes have not been confirmed."); return false; }
    finally { busyRef.current = false; setSaving(false); }
  }
  const saveItem = (value: LifeItem, item?: SavedLifeItem) => act({ action: "save", id: item?.id ?? crypto.randomUUID(), version: item?.version ?? 0, data: lifeItemSchema.parse(value) });
  const taskAction = (command: Extract<WorkspaceAction, { action: "task" }>["command"]) => act({ action: "task", requestId: crypto.randomUUID(), command });
  const goalAction = (command: Extract<WorkspaceAction, { action: "goal" }>["command"]) => act({ action: "goal", requestId: crypto.randomUUID(), command });

  function taskEditor(task?: Workspace["tasks"][number], goalId?: string) {
    setEditor({ title: task ? "Make this task work for you" : "One small thing", subtitle: "A clear next step is enough. You can also ask Tempo by text.", fields: [
      { name: "title", label: "What would you like to do?", value: task?.title, required: true },
      { name: "minutes", label: "Estimated minutes", type: "number", value: task?.estimatedMinutes ?? 25, min: 1, max: 1440 },
      { name: "due", label: `Schedule (device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`, type: "datetime-local", value: task?.dueAt ? new Date(new Date(task.dueAt).getTime() - new Date(task.dueAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "" },
    ], submit: values => taskAction(task ? { type: "update_task", taskId: task.id, patch: { title: values.title, estimatedMinutes: Number(values.minutes), dueAt: values.due ? new Date(values.due).toISOString() : null } } : { type: "create_task", title: values.title, estimatedMinutes: Number(values.minutes), ...(values.due ? { dueAt: new Date(values.due).toISOString() } : {}), ...(goalId ? { goalId } : {}) }) });
  }
  function goalEditor(goal?: Workspace["goals"][number]) {
    setNotice("");
    setEditor({ title: goal ? "Shape your goal" : "Something to work toward", subtitle: "Make it meaningful to you. Progress can be small.", fields: [{ name: "title", label: "Your goal", value: goal?.title, required: true }, { name: "description", label: "Why it matters", type: "textarea", value: goal?.description ?? "" }], submit: v => goalAction(goal ? { type: "update_goal", goalId: goal.id, patch: { title: v.title, description: v.description || null } } : { type: "create_goal", title: v.title, ...(v.description ? { description: v.description } : {}) }) });
  }
  function itemEditor(kind: LifeItem["kind"], item?: SavedLifeItem) {
    setNotice("");
    const value = item?.data;
    const fields: Field[] = [{ name: "title", label: kind === "note" ? "What’s on your mind?" : "Name", value: value?.title, required: true }];
    if (["food", "meal", "workout"].includes(kind)) fields.push({ name: "date", label: "Date", type: "date", value: value && "date" in value ? value.date : date, required: true });
    if (kind === "food" || kind === "meal") fields.push({ name: "meal", label: "Meal", options: ["Breakfast", "Lunch", "Dinner", "Snack"], value: value && "meal" in value ? value.meal : "Breakfast" });
    if (kind === "food") for (const key of ["calories", "protein", "carbs", "fat", "fiber"] as const) fields.push({ name: key, label: key === "calories" ? "Calories (kcal)" : `${key[0].toUpperCase()}${key.slice(1)} (g)`, type: "number", value: value?.kind === "food" ? value[key] ?? "" : "", min: 0, max: 10000 });
    if (kind === "meal") fields.push({ name: "ingredients", label: "Ingredients · one per line", type: "textarea", value: value?.kind === "meal" ? value.ingredients : "" }, { name: "servings", label: "Servings (optional)", type: "number", min: 1, max: 100, value: value?.kind === "meal" ? value.servings ?? "" : "" });
    if (kind === "recipe") fields.push({ name: "ingredients", label: "Ingredients · one per line", type: "textarea", value: value?.kind === "recipe" ? value.ingredients : "", required: true }, { name: "instructions", label: "Preparation steps", type: "textarea", value: value?.kind === "recipe" ? value.instructions : "" }, { name: "servings", label: "Servings", type: "number", min: 1, max: 100, value: value?.kind === "recipe" ? value.servings : 1 }, { name: "prepMinutes", label: "Preparation time (minutes)", type: "number", min: 0, max: 1440, value: value?.kind === "recipe" ? value.prepMinutes : 15 });
    if (kind === "note") fields.push({ name: "body", label: "A little more detail (optional)", type: "textarea", value: value?.kind === "note" ? value.body : "" });
    if (kind === "workout") fields.push({ name: "activity", label: "Movement", options: ["Walk", "Strength", "Cardio", "Mobility", "Other"], value: value?.kind === "workout" ? value.activity : "Walk" }, { name: "minutes", label: "Minutes", type: "number", value: value?.kind === "workout" ? value.minutes : 20, min: 1, max: 1440 });
    if (kind === "routine") fields.push({ name: "period", label: "Time of day", options: ["morning", "evening"], value: value?.kind === "routine" ? value.period : "morning" }, { name: "time", label: `Start time · ${data?.timezone}`, type: "time", value: value?.kind === "routine" ? value.time : "08:00", required: true }, { name: "steps", label: "Steps · one per line, with minutes after | (e.g. Breakfast | 15)", type: "textarea", value: value?.kind === "routine" ? value.steps.map(step => `${step.title} | ${step.minutes}`).join("\n") : "Open the curtains | 1\nDrink a glass of water | 2\nChoose one thing for today | 3", required: true });
    const titles: Record<string, string> = { recipe: "A meal worth remembering", routine: "Build a gentler rhythm", food: "Log what you ate", meal: "A little less dinner indecision", workout: "Every bit of movement counts", note: "Put it here. Let it go.", grocery: "Add to your shopping list" };
    setEditor({ title: titles[kind], subtitle: kind === "food" ? "Use your food label for the portion you ate. Leave unknown nutrients blank. For database search, choose Search foods in your diary." : "Keep it simple. You can change this whenever you need.", fields, submit: async v => {
      const payload: Record<string, unknown> = { ...v, kind };
      if (kind === "food") for (const key of ["calories", "protein", "carbs", "fat", "fiber"]) payload[key] = v[key] === "" ? null : Number(v[key]);
      if (kind === "recipe") { payload.servings = Number(v.servings); payload.prepMinutes = Number(v.prepMinutes); payload.favorite = value?.kind === "recipe" ? value.favorite : true; }
      if (kind === "meal") { if (v.servings === "") delete payload.servings; else payload.servings = Number(v.servings); }
      if (kind === "workout") payload.minutes = Number(v.minutes);
      if (kind === "grocery") payload.checked = value?.kind === "grocery" ? value.checked : false;
      if (kind === "routine") payload.steps = v.steps.split("\n").filter(line => line.trim()).map((line, i) => {
        const [title, minutes] = line.split("|").map(part => part.trim());
        const previous = value?.kind === "routine" ? value.steps[i] : undefined;
        return { id: previous?.title === title ? previous.id : crypto.randomUUID(), title, minutes: Number(minutes || 5), completedOn: previous?.title === title ? previous.completedOn : null };
      });
      const parsed = lifeItemSchema.safeParse(payload);
      if (!parsed.success) { setNotice("Check the fields. Routine steps need a name and 1–180 minutes; other values must be within the shown limits."); return false; }
      return saveItem(parsed.data, item);
    } });
  }
  function remove(item: SavedLifeItem) {
    setNotice("");
    setEditor({ title: `Remove “${item.data.title}”?`, subtitle: "This removes the saved item from your Tempo workspace.", fields: [], submit: () => act({ action: "delete", id: item.id, version: item.version }) });
  }
  async function startFocus(task: Workspace["tasks"][number]) {
    if (focus) { setFocusHidden(false); setNotice("Finish or leave the current focus session before starting another."); return; }
    if (await taskAction({ type: "start_task", taskId: task.id })) setFocusHidden(false);
  }
  async function routineCheck(item: SavedLifeItem, id: string) {
    if (item.data.kind !== "routine") return false;
    return saveItem({ ...item.data, steps: item.data.steps.map(step => step.id === id ? { ...step, completedOn: step.completedOn === today ? null : today } : step) }, item);
  }
  async function finishFocus() {
    if (!focus) return;
    let done = true;
    if (focus.taskId) done = await taskAction({ type: "complete_task", taskId: focus.taskId });
    else if (focusItem) done = await act({ action: "finish_focus", id: focusItem.id, version: focusItem.version });
    if (done) { setFocusHidden(false); setNotice("That’s one thing done. Take a breath before the next."); }
  }
  function ask(text: string) { go("assistant"); setDraft(text); }
  function readBriefing() {
    if (!("speechSynthesis" in window)) { setNotice("This browser doesn’t support spoken briefings."); return; }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(`Hello. You have ${open.length} open tasks. ${open[0] ? `One place to start is ${open[0].title}.` : "There is room to breathe."} ${data?.reminders.slice(0, 3).map(r => `${r.text}, at ${time(r.remindAt)}.`).join(" ") ?? ""}`);
    speech.rate = .9; window.speechSynthesis.speak(speech);
  }
  const empty = (title: string, body: string, action?: () => void, label = "Add your first one") => <div className={s.empty}><FiSun /><h3>{title}</h3><p>{body}</p>{action && <button className={s.primary} onClick={action}><FiPlus />{label}</button>}</div>;
  const taskRow = (task: Workspace["tasks"][number]) => <div className={s.taskRow} key={task.id}>
    <button className={`${s.check} ${task.status === "completed" ? s.checked : ""}`} disabled={saving || task.status === "completed"} aria-label={`Complete ${task.title}`} onClick={() => void taskAction({ type: "complete_task", taskId: task.id })}>{task.status === "completed" && <FiCheck />}</button>
    <div className={s.grow}><strong className={task.status === "completed" ? s.done : ""}>{task.title}</strong><small>{task.dueAt ? taskDueLabel(task.dueAt, data?.timezone ?? "UTC", true) : "Whenever there’s room"} {task.estimatedMinutes ? `· ${task.estimatedMinutes} min` : ""}</small></div>
    {task.status !== "completed" && <><button className={s.iconButton} title="Edit task" aria-label={`Edit ${task.title}`} onClick={() => taskEditor(task)}><FiEdit2 /></button><button className={s.startButton} disabled={saving} onClick={() => void startFocus(task)}><FiPlay /> Start</button></>}
  </div>;
  const itemActions = (item: SavedLifeItem) => <div className={s.row}><button className={s.iconButton} aria-label={`Edit ${item.data.title}`} onClick={() => itemEditor(item.data.kind, item)}><FiEdit2 /></button><button className={s.iconButton} aria-label={`Remove ${item.data.title}`} onClick={() => remove(item)}><FiTrash2 /></button></div>;
  const routineCard = (item: SavedLifeItem) => {
    if (item.data.kind !== "routine") return null;
    const routine = item.data; const count = routine.steps.filter(step => step.completedOn === today).length;
    return <article className={`${s.card} ${s.routineVisual}`} data-period={routine.period} key={item.id}><div className={s.routineCover}><SectionArt section={routine.period === "morning" ? "routines" : "evening"} /><span>{routine.period === "morning" ? "RISE & SHINE" : "WIND DOWN"}</span></div><div className={s.between}><span className={`${s.tileIcon} ${routine.period === "morning" ? s.amber : s.lavender}`}>{routine.period === "morning" ? <FiSun /> : <FiMoon />}</span>{itemActions(item)}</div><p className={s.eyebrow}>{routine.period} · {routine.time}</p><h3>{routine.title}</h3><div className={s.between}><small>{count} of {routine.steps.length} steps</small><small>{routine.steps.reduce((n, step) => n + step.minutes, 0)} min · at your pace</small></div><progress max={Math.max(1, routine.steps.length)} value={count} aria-label={`${routine.title} progress`} />
      {routine.steps.map(step => <div className={s.step} key={step.id}><button className={`${s.check} ${step.completedOn === today ? s.checked : ""}`} disabled={saving} aria-label={`${step.completedOn === today ? "Uncheck" : "Complete"} ${step.title}`} onClick={() => void routineCheck(item, step.id)}>{step.completedOn === today && <FiCheck />}</button><span className={s.grow}>{step.title}<small>{step.minutes} min</small></span><button className={s.iconButton} aria-label={`Focus on ${step.title}`} disabled={saving || step.completedOn === today} onClick={() => { if (focus) { setFocusHidden(false); return; } void saveItem({ kind: "focus", title: step.title, routineId: item.id, stepId: step.id, remaining: step.minutes * 60, endsAt: new Date(Date.now() + step.minutes * 60_000).toISOString() }).then(ok => { if (ok) setFocusHidden(false); }); }}><FiPlay /></button></div>)}
      <small className={s.routineHint}><FiCheckCircle /> Fresh checkmarks each day</small></article>;
  };

  return <div className={s.app} data-section={section}>
    <aside className={`${s.sidebar} ${mobile ? s.sidebarOpen : ""}`}><Link href={preview ? "/workspace/preview" : "/workspace"} className={s.brand}><Image src="/images/tempo-avatar.png" alt="" width={39} height={37} />Tempo</Link><div className={s.spaceLabel}>A LITTLE SPACE FOR YOU</div><nav aria-label="Your workspace">{sections.map(([key, label, Icon], i) => <button key={key} onClick={() => go(key)} aria-current={section === key ? "page" : undefined} className={`${section === key ? s.activeNav : ""} ${i === 4 || i === 9 ? s.navDivider : ""}`}><Icon /><span>{label}</span>{key === "inbox" && items.filter(item => item.data.kind === "note").length > 0 && <span className={s.navCount}>{items.filter(item => item.data.kind === "note").length}</span>}{key === "assistant" && <span className={s.spark}>✦</span>}</button>)}</nav><div className={s.sidebarBottom}><div className={s.sidebarNote}><FiMessageCircle /><strong>A thought? A change of plan?</strong><button onClick={() => go("assistant")}>Talk to Tempo <FiArrowRight /></button></div><button className={s.person} onClick={() => go("settings")}><span>{data?.profile.displayName?.[0] ?? "Y"}</span><div><strong>{data?.profile.displayName ?? "Your workspace"}</strong><small>{preview ? "Preview account" : "Your personal space"}</small></div><FiMoreHorizontal /></button></div></aside>
    {mobile && <button className={s.scrim} aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <div className={s.main}>
      <header className={s.topbar}><div className={s.row}><button className={`${s.iconButton} ${s.menuButton}`} aria-label="Open navigation" onClick={() => setMobile(!mobile)}><FiMenu /></button><span>{sections.find(([key]) => key === section)?.[1]}</span></div><div className={s.row}><span className={s.dateLabel}>{now ? new Intl.DateTimeFormat(undefined, { timeZone: data?.timezone, weekday: "short", month: "short", day: "numeric" }).format(now) : ""}</span><button className={s.iconButton} title="Hide private content" aria-label="Hide private content" onClick={() => { setHidden(!hidden); window.speechSynthesis?.cancel(); }}><FiMoon /></button><button className={s.primary} onClick={() => itemEditor("note")} disabled={!data}><FiPlus /> Quick capture</button></div></header>
      {preview && <div className={s.previewBanner}><span>Preview workspace · sample data · changes reset on reload</span><Link href="/workspace">Open my workspace <FiArrowRight /></Link></div>}
      {notice && <div className={s.toast} role="status"><span>{notice}</span><button className={s.iconButton} aria-label="Dismiss message" onClick={() => setNotice("")}><FiX /></button></div>}
      {hidden ? <div className={s.gate}><FiMoon /><h1>A little privacy.</h1><button className={s.primary} onClick={() => setHidden(false)}>Show my workspace</button></div> : !data ? <div className={s.gate}><span className={s.gateIcon}><FiSun /></span><p className={s.eyebrow}>YOUR LIFE, A LITTLE LIGHTER</p><h1>Everything you need.<br />Room to breathe.</h1><p>{error || "Getting your space ready…"}</p><div className={s.row}><Link className={s.primary} href="/login">Log in to Tempo <FiArrowRight /></Link><Link className={s.secondary} href="/workspace/preview">Explore the workspace</Link></div>{error && <button className={s.textButton} onClick={() => void refresh()}>Try again</button>}</div> : <div className={s.content}>
        {section === "today" ? <>
          <div className={s.pageHeading}><div><p className={s.eyebrow}>YOUR DAY, AT YOUR PACE</p><h1>Your day.<br /><span>One step at a time.</span></h1><p>Welcome back, {data.profile.displayName?.split(" ")[0] || "you"}. Here’s your next step.</p></div><div className={s.sunArt} aria-hidden="true"><div /><FiSun /></div></div>
          <div className={s.dashboard}>
            <div className={s.primaryColumn}>
              <article className={s.focusCard}><div className={s.between}><span className={s.pill}><span /> YOUR NEXT SMALL STEP</span><FiMoreHorizontal /></div><h2>{open[0]?.title ?? "Make a little room for what matters"}</h2><p>{open[0] ? "Ready when you are." : "Capture a task or ask Tempo to help you plan."}</p><div className={s.between}><span className={s.row}><FiClock /> {open[0]?.estimatedMinutes ?? 25} minutes · one thing at a time</span><button className={s.darkButton} disabled={saving} onClick={() => open[0] ? void startFocus(open[0]) : taskEditor()}><FiPlay />{open[0] ? "Let’s begin" : "Add a task"}</button></div><div className={s.focusDecoration} aria-hidden="true" /></article>
              <div className={s.stats}><button onClick={() => go("tasks")}><span className={`${s.statIcon} ${s.sage}`}><FiCheckCircle /></span><div><strong>{completed.length}<small>{completed.length === 1 ? " thing done" : " things done"}</small></strong><p>Every small win counts</p></div></button><button onClick={() => go("routines")}><span className={`${s.statIcon} ${s.amber}`}><FiSun /></span><div><strong>{routines.reduce((n, item) => n + (item.data.kind === "routine" ? item.data.steps.filter(step => step.completedOn === today).length : 0), 0)}<small> routine steps</small></strong><p>Building your rhythm</p></div></button></div>
              <article className={s.card}><div className={s.sectionHeading}><h2>Your checklist</h2><button className={s.textButton} onClick={() => go("tasks")}>All tasks <FiArrowRight /></button></div>{open.slice(0, 4).map(taskRow)}{!open.length && empty("A clear canvas", "Add one thing you’d like to make space for.", () => taskEditor(), "Add a task")}<button className={s.addLine} onClick={() => taskEditor()}><FiPlus /> Add a small step</button></article>
              <div className={s.sectionHeading}><h2>Daily routines</h2><button className={s.textButton} onClick={() => go("routines")}>My routines <FiArrowRight /></button></div><div className={s.twoColumns}>{routines.slice(0, 2).map(routineCard)}{!routines.length && empty("A softer start and finish", "Build a routine that feels like support.", () => itemEditor("routine"), "Create a routine")}</div>
            </div>
            <aside className={s.rightRail}><article className={`${s.card} ${s.assistantCard}`}><span className={s.assistantOrb}>✦</span><p className={s.eyebrow}>LESS TO HOLD IN YOUR HEAD</p><h2>You’ve got Tempo.</h2><p>Plan. Remember. Rearrange.</p><button className={s.secondary} onClick={() => ask("Help me make a manageable plan for today.")}>Help me plan my day <FiArrowRight /></button><div className={s.softDivider} /><small>{data.profile.proactiveOptIn ? "Optional check-ins are on. Quiet hours still apply." : "You choose when Tempo checks in. Set your preferences in Settings."}</small></article>
              <article className={s.card}><div className={s.sectionHeading}><h3>On the horizon</h3><FiCalendar /></div>{data.busy.slice(0, 2).map(busy => <div className={s.agendaItem} key={busy.id}><span className={s.agendaDot} /><div><strong>Calendar busy window</strong><small>{now ? `${agendaDateLabel(busy.startsAt, data.timezone, now)} · ` : ""}{time(busy.startsAt)} – {now && localDay(new Date(busy.startsAt), data.timezone) !== localDay(new Date(busy.endsAt), data.timezone) ? `${agendaDateLabel(busy.endsAt, data.timezone, now)} · ` : ""}{time(busy.endsAt)}</small></div></div>)}{data.reminders.slice(0, 2).map(reminder => <div className={s.agendaItem} key={reminder.id}><span className={`${s.agendaDot} ${s.orange}`} /><div><strong>{reminder.text}</strong><small>{now ? `${agendaDateLabel(reminder.remindAt, data.timezone, now)} · ` : ""}{time(reminder.remindAt)} · {reminder.status}</small></div></div>)}{!data.busy.length && !data.reminders.length && <p className={s.muted}>Nothing saved in the next 24 hours.</p>}<button className={s.textButton} onClick={() => go("calendar")}>Open calendar <FiArrowRight /></button></article>
              <article className={`${s.card} ${s.mealTeaser}`}><FiCoffee /><p className={s.eyebrow}>ONE LESS DECISION</p><h3>{items.find(item => item.data.kind === "meal" && item.data.date === today)?.data.title ?? "What sounds good tonight?"}</h3><MealIllustration meal="Dinner" /><button className={s.textButton} onClick={() => go("meals")}>Your meal plan <FiArrowRight /></button></article>

            </aside>
          </div>
        </> : <>
          <div className={s.pageHeading}><div><p className={s.eyebrow}>{section === "assistant" ? "ONE CONVERSATION. YOUR WHOLE DAY." : section === "tasks" ? "DO THE NEXT THING" : section === "goals" ? "GROW OVER TIME" : "MAKE IT WORK FOR YOU"}</p><h1>{({ tasks: "One thing at a time.", goals: "Your bigger picture.", calendar: "Your calendar.", routines: "Your daily rhythm.", meals: "What’s cooking?", nutrition: "Food & fuel.", movement: "Make room to move.", inbox: "Park a thought.", assistant: "Talk to Tempo.", wake: "A softer start. A calmer night.", settings: "Make it yours." } as Record<string, string>)[section]}</h1><p>{({ tasks: "Today’s to-dos. A little room for the week.", goals: "Longer-term intentions. Small steps that add up.", calendar: "Events · tasks · reminders", routines: "Morning light. Evening calm.", meals: "Recipes · meal plan · groceries", nutrition: "Your diary, without judgment.", movement: "Walk. Stretch. Work out.", inbox: "Capture now. Sort later.", assistant: "One conversation for your whole day.", wake: "Sunrise light · evening calm · gentle sound", settings: "Your support. Your preferences.", } as Record<string, string>)[section]}</p></div>{!["tasks", "goals"].includes(section) && <SectionArt section={section} />}</div>
          {section === "tasks" && <TasksView data={data} today={today} saving={saving} edit={taskEditor} start={task => void startFocus(task)} complete={task => void taskAction({ type: "complete_task", taskId: task.id })} />}
          {section === "goals" && <GoalsView data={data} saving={saving} edit={goalEditor} addStep={id => taskEditor(undefined, id)} editStep={taskEditor} achieve={id => void goalAction({ type: "complete_goal", goalId: id })} />}
          {section === "calendar" && <CalendarView data={data} preview={preview} ask={ask} editTask={taskEditor} />}
          {section === "routines" && <><div className={s.sectionHeading}><h2>Daily routines</h2><button className={s.primary} onClick={() => itemEditor("routine")}><FiPlus /> New routine</button></div><div className={s.twoColumns}>{routines.map(routineCard)}</div>{!routines.length && empty("Start and end with a little support", "Add a few steps for your morning or evening.", () => itemEditor("routine"), "Build a routine")}<div className={s.infoStrip}><FiMessageCircle /><span>Morning reminder by text</span><button className={s.textButton} onClick={() => ask("Remind me every day at 8 am to start my morning routine.")}>Ask Tempo <FiArrowRight /></button></div></>}
          {section === "meals" && <><div className={s.sectionHeading}><div><h2>Meals worth remembering</h2></div><button className={s.secondary} onClick={() => itemEditor("recipe")}><FiPlus /> Save a recipe</button></div><div className={s.recipeGrid}>{recipes.map(item => <article className={`${s.card} ${s.recipeCard}`} key={item.id}><div className={s.between}><span className={`${s.tileIcon} ${s.rose}`}><FiHeart /></span>{itemActions(item)}</div><h3>{item.data.title}</h3>{item.data.kind === "recipe" && <><small>{item.data.prepMinutes} min · {item.data.servings} {item.data.servings === 1 ? "serving" : "servings"}</small><details><summary>Ingredients & preparation</summary><p className={s.prewrap}>{item.data.ingredients}</p><p className={s.prewrap}>{item.data.instructions}</p></details><button className={s.textButton} disabled={saving} onClick={() => { if (item.data.kind === "recipe") void saveItem({ kind: "meal", title: item.data.title, date, meal: "Dinner", ingredients: item.data.ingredients, servings: item.data.servings }); }}>Plan for dinner <FiArrowRight /></button></>}</article>)}</div>{!recipes.length && <div className={s.infoStrip}><FiHeart /><span>Keep a favorite recipe here.</span><button className={s.textButton} onClick={() => ask("Save a favorite recipe for me: ")}>Tell Tempo <FiArrowRight /></button></div>}<div className={s.sectionHeading}><div className={s.row}><h2>On the menu</h2><input className={s.dateInput} aria-label="Meal plan date" type="date" value={date} onChange={e => setSelectedDate(e.target.value)} /></div><button className={s.primary} onClick={() => itemEditor("meal")}><FiPlus /> Plan a meal</button></div><div className={s.mealGrid}>{["Breakfast", "Lunch", "Dinner", "Snack"].map((meal, index) => <article className={s.card} key={meal}><div className={`${s.mealArt} ${[s.amber, s.sage, s.lavender, s.rose][index]}`}><MealIllustration meal={meal} /></div><p className={s.eyebrow}>{meal}</p>{items.filter(item => item.data.kind === "meal" && item.data.date === date && item.data.meal === meal).map(item => <div key={item.id}><h3>{item.data.title}</h3>{item.data.kind === "meal" && item.data.servings && <small>{item.data.servings} {item.data.servings === 1 ? "serving" : "servings"}</small>}{item.data.kind === "meal" && item.data.ingredients && <details className={s.inlineDetails}><summary>Ingredients</summary><p className={s.prewrap}>{item.data.ingredients}</p></details>}{itemActions(item)}</div>)}{!items.some(item => item.data.kind === "meal" && item.data.date === date && item.data.meal === meal) && <><p className={s.muted}>Nothing planned</p></>}<button className={s.textButton} onClick={() => itemEditor("meal")}><FiPlus /> Add a meal</button></article>)}</div><article className={s.card}><div className={s.sectionHeading}><h2><FiShoppingBag /> Shopping list</h2><button className={s.secondary} onClick={() => itemEditor("grocery")}><FiPlus /> Add grocery</button></div>{items.filter(item => item.data.kind === "grocery").map(item => <div className={s.taskRow} key={item.id}><button className={`${s.check} ${item.data.kind === "grocery" && item.data.checked ? s.checked : ""}`} disabled={saving} aria-label={`Toggle ${item.data.title}`} onClick={() => { if (item.data.kind === "grocery") void saveItem({ ...item.data, checked: !item.data.checked }, item); }}>{item.data.kind === "grocery" && item.data.checked && <FiCheck />}</button><span className={s.grow}>{item.data.title}</span>{itemActions(item)}</div>)}{!items.some(item => item.data.kind === "grocery") && <p className={s.muted}>All clear.</p>}</article></>}
          {section === "nutrition" && <><div className={s.sectionHeading}><input className={s.dateInput} aria-label="Food log date" type="date" value={date} onChange={e => setSelectedDate(e.target.value)} /><button className={s.primary} onClick={() => setFoodSearch(true)}><FiPlus /> Search foods / scan</button></div><div className={s.nutritionSummary}><article className={`${s.card} ${s.calorieCard}`}><div className={s.calorieCircle}><FiHeart /><strong>{Math.round(totals.calories)}</strong><span>kcal logged</span></div><div><p className={s.eyebrow}>TODAY’S FUEL</p><h2>Logged, not judged.</h2><small>Known values only · — means unknown</small><details className={s.inlineDetails}><summary>About these totals</summary><p>Open Food Facts and your own foods. Missing nutrients are excluded, not counted as zero. Check portions against the package.</p></details></div></article><article className={s.card}><h3>Nutrients logged</h3>{(["protein", "carbs", "fat", "fiber"] as const).map((key, i) => <div className={s.nutrient} key={key}><span><i className={[s.sage, s.amber, s.lavender, s.rose][i]} />{key[0].toUpperCase() + key.slice(1)}</span><strong>{Math.round(totals[key] * 10) / 10} g</strong></div>)}</article></div><article className={s.card}><div className={s.sectionHeading}><h2>Your food diary</h2><button className={s.textButton} onClick={() => itemEditor("food")}>Quick manual entry</button><small>{foods.length} entries</small></div>{["Breakfast", "Lunch", "Dinner", "Snack"].map(meal => <div className={s.diaryMeal} key={meal}><p className={s.eyebrow}><span className={s.mealDot} />{meal}</p>{foods.filter(item => item.data.kind === "food" && item.data.meal === meal).map(item => <div className={s.taskRow} key={item.id}><FiCoffee /><div className={s.grow}><strong>{item.data.title}</strong>{item.data.kind === "food" && <small>{item.data.calories ?? "—"} kcal · {item.data.protein ?? "—"} g protein · {item.data.carbs ?? "—"} g carbs · {item.data.fat ?? "—"} g fat</small>}</div>{itemActions(item)}</div>)}{!foods.some(item => item.data.kind === "food" && item.data.meal === meal) && <small>Not logged yet</small>}</div>)}</article></>}
          {section === "movement" && <><div className={s.sectionHeading}><input className={s.dateInput} aria-label="Movement date" type="date" value={date} onChange={e => setSelectedDate(e.target.value)} /><button className={s.primary} onClick={() => itemEditor("workout")}><FiPlus /> Log movement</button></div><article className={`${s.card} ${s.movementHero}`}><span className={s.largeIcon}><FiZap /></span><div><p className={s.eyebrow}>IT ALL COUNTS</p><h2><strong className={s.movementNumber}>{items.reduce((n, item) => n + (item.data.kind === "workout" && item.data.date === date ? item.data.minutes : 0), 0)}</strong> minutes logged</h2><p>Every kind of movement counts.</p></div></article><div className={s.twoColumns}>{items.filter(item => item.data.kind === "workout" && item.data.date === date).map(item => <article className={s.card} key={item.id}><div className={s.between}><span className={`${s.tileIcon} ${s.sage}`}><FiZap /></span>{itemActions(item)}</div><h3>{item.data.title}</h3>{item.data.kind === "workout" && <p>{item.data.activity} · {item.data.minutes} minutes</p>}</article>)}</div>{!items.some(item => item.data.kind === "workout" && item.data.date === date) && empty("A fresh start", "Log movement when it happens. No streak to protect.", () => itemEditor("workout"), "Log movement")}</>}
          {section === "inbox" && <><div className={s.captureBox}><FiInbox /><div><h2>Out of your head. Saved here.</h2></div><button className={s.primary} onClick={() => itemEditor("note")}><FiPlus /> Capture a thought</button></div><div className={s.twoColumns}>{items.filter(item => item.data.kind === "note").map(item => <article className={s.card} key={item.id}><div className={s.between}><span className={s.eyebrow}>SAVED FOR LATER</span>{itemActions(item)}</div><h3>{item.data.title}</h3>{item.data.kind === "note" && <details className={s.noteDetails}><summary>{item.data.body.slice(0, 100) || "Open note"}{item.data.body.length > 100 ? "…" : ""}</summary><p className={s.prewrap}>{item.data.body}</p></details>}<button className={s.textButton} onClick={() => { void taskAction({ type: "create_task", title: item.data.title }).then(ok => { if (ok) setNotice("Added as a task. Your original note is still here."); }); }}>Add as a task <FiArrowRight /></button></article>)}</div>{!items.some(item => item.data.kind === "note") && empty("A place for the loose ends", "Nothing captured yet. You can add a thought here or text Tempo.", () => itemEditor("note"), "Capture a thought")}</>}
          {section === "assistant" && <div className={s.chatLayout}><article className={s.chatCard}><div className={s.chatHeader}><span className={s.assistantOrb}>✦</span><div><strong>Tempo</strong><small>{preview ? "Preview · no AI calls" : "Your shared web & text conversation"}</small></div><span className={s.badge}>Your assistant</span></div><div className={s.messages}>{!data.messages.length && empty("Start wherever you are", "Try asking for one manageable next step.")}{data.messages.map(message => <div key={message.id} className={`${s.message} ${message.direction === "inbound" ? s.userMessage : ""}`}><small>{message.direction === "inbound" ? "You" : "Tempo"} · {time(message.createdAt)}</small><ChatMessage body={message.body} />{["received", "processing"].includes(message.status) && <small role="status">{now && now.getTime() - new Date(message.createdAt).getTime() > 30_000 ? "Your message is saved. Tempo is taking longer than usual; no need to resend." : "Tempo is working on your message…"}</small>}</div>)}<div ref={chatEnd} /></div><form className={s.composer} onSubmit={async e => { e.preventDefault(); if (!chatRequest.current || chatRequest.current.text !== draft) chatRequest.current = { text: draft, id: crypto.randomUUID() }; if (await act({ action: "chat", requestId: chatRequest.current.id, text: draft })) { setDraft(""); chatRequest.current = null; } }}><textarea aria-label="Message Tempo" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} placeholder="Add a task, change a plan, tell me what’s on your mind…" rows={2} required /><button className={s.primary} disabled={saving || !draft.trim()} type="submit" aria-label="Send message"><FiSend /></button></form><small className={s.chatHint}>Calendar edits ask first · Replies refresh automatically</small></article><aside className={s.card}><p className={s.eyebrow}>YOU CAN JUST ASK</p><h3>Start with a tap</h3>{[{ label: "Pick a task", text: "Help me choose one task to start.", icon: FiCheckCircle }, { label: "My routine", text: "Show me my morning routine.", icon: FiSun }, { label: "Set a reminder", text: "Help me set a reminder.", icon: FiClock }, { label: "Today’s calendar", text: "What’s on my calendar today?", icon: FiCalendar }, { label: "Save a thought", text: "Save a note: ", icon: FiInbox }].map(({ label, text, icon: Icon }) => <button className={s.prompt} key={label} onClick={() => setDraft(text)}><Icon /><span>{label}</span><FiArrowRight /></button>)}<details className={s.inlineDetails}><summary>What Tempo can do</summary><p>Manage your tasks, goals, routines, and logs; find foods and save recipes. Calendar changes need confirmation. Missing nutrients stay unknown.</p></details></aside></div>}
          {section === "wake" && <WakeExperience onRoutines={() => go("routines")} />}
          {section === "settings" && <div className={s.twoColumns}><article className={s.card}><span className={`${s.tileIcon} ${s.sage}`}><FiMessageCircle /></span><h2>Text check-ins</h2><label className={s.toggleRow}><span><strong>Proactive check-ins</strong><small>Optional · quiet hours respected</small></span><input type="checkbox" checked={data.profile.proactiveOptIn} disabled={saving} onChange={e => void act({ action: "checkins", enabled: e.target.checked })} /></label><details className={s.inlineDetails}><summary>Quiet hours & delivery</summary><p className={s.finePrint}>Quiet hours: {data.profile.quietHoursStart?.slice(0, 5) ?? "not set"}–{data.profile.quietHoursEnd?.slice(0, 5) ?? "not set"} · {data.timezone}. Actual outreach also depends on the configured worker and sending controls.</p></details><Link className={s.secondary} href="/profile">Profile & coaching instructions <FiArrowRight /></Link></article><article className={s.card}><span className={`${s.tileIcon} ${s.amber}`}><FiMaximize /></span><h2>Whiteboard & audio</h2><div className={s.settingButtons}><button className={s.secondary} onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setNotice("Use your browser’s full-screen control on this device."); } }}><FiMaximize /> Toggle full screen</button><button className={s.secondary} onClick={readBriefing}><FiSun /> Read my day aloud</button><button className={s.textButton} onClick={() => window.speechSynthesis?.cancel()}>Stop audio</button></div><small>Audio begins only when you ask. Scheduled spoken announcements are not enabled.</small></article><article className={s.card}><FiCalendar /><h2>Connections</h2><p>Google Calendar: {data.calendar?.status === "active" ? "connected" : "not connected"}</p><Link className={s.secondary} href="/extensions">Manage connections <FiArrowRight /></Link><details className={s.inlineDetails}><summary>Available integrations</summary><p>Food search and barcodes use Open Food Facts. MyFitnessPal, wearable, and health-app account imports are not connected.</p></details></article><article className={s.card}><FiBookOpen /><h2>Privacy</h2><details className={s.inlineDetails}><summary>What to keep here</summary><p>Everyday notes belong here. Keep passwords, medical records, and sensitive documents in a dedicated secure service.</p></details><button className={s.textButton} onClick={() => setHidden(true)}>Hide this workspace <FiMoon /></button></article></div>}
        </>}
        {section !== "assistant" && <form className={s.everywhereComposer} onSubmit={async e => { e.preventDefault(); if (!chatRequest.current || chatRequest.current.text !== draft) chatRequest.current = { text: draft, id: crypto.randomUUID() }; if (await act({ action: "chat", requestId: chatRequest.current.id, text: draft })) { setDraft(""); chatRequest.current = null; go("assistant"); } }}><span className={s.assistantOrb}>✦</span><input aria-label="Ask Tempo from anywhere" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask Tempo to add or change anything…" maxLength={2000} required /><button className={s.primary} type="submit" aria-label="Send to Tempo" disabled={saving || !draft.trim()}><FiSend /></button></form>}
        <footer className={s.footer}><span>tempo · your pace</span><button className={s.textButton} onClick={() => go("assistant")}>You can always just ask <FiMessageCircle /></button></footer>
      </div>}
      {focus && focusHidden && !hidden && <button className={s.focusDock} onClick={() => setFocusHidden(false)}><FiPlay /><span>{focus.title}</span><strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong><FiMaximize /></button>}
    </div>
    <dialog ref={focusDialog} className={s.focusDialog} onCancel={() => setFocusHidden(true)} aria-label="Current focus session">{focus && data && <div className={s.focusOverlay}><div className={s.focusTop}><span className={s.brand}><Image src="/images/tempo-avatar.png" alt="" width={39} height={37} />Tempo</span><button className={s.secondary} onClick={() => setFocusHidden(true)}><FiArrowLeft /> Back to my day</button></div><div className={s.focusCenter}><p className={s.eyebrow}>{remaining ? "JUST THIS. JUST NOW." : "A MOMENT TO CHECK IN"}</p><h1>{focus.title}</h1><p>{remaining ? "The rest can wait. You’re in the right place." : "Time is up. Finished, or would a little more time help?"}</p><div className={s.timerRing}><span role="timer" aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}>{Math.floor(remaining / 60)}<i>:</i>{String(remaining % 60).padStart(2, "0")}</span><small>{focus.endsAt ? "one small step at a time" : "paused · take the time you need"}</small></div><div className={s.focusActions}><button className={s.secondary} disabled={saving} onClick={() => void saveItem({ ...focus, remaining, endsAt: focus.endsAt ? null : new Date(Date.now() + remaining * 1000).toISOString() }, focusItem)}>{focus.endsAt ? <FiPause /> : <FiPlay />}{focus.endsAt ? "Pause" : "Resume"}</button><button className={s.darkButton} disabled={saving} onClick={() => void finishFocus()}><FiCheck /> I’m done</button><button className={s.secondary} disabled={saving} onClick={() => void saveItem({ ...focus, remaining: remaining + 300, endsAt: new Date(Date.now() + (remaining + 300) * 1000).toISOString() }, focusItem)}>+ 5 minutes</button></div><button className={s.textButton} onClick={() => { setFocusHidden(true); ask("I’m stuck on my current task. Help me make the next step smaller."); }}>Feeling stuck? Let’s make it smaller <FiArrowRight /></button></div><p className={s.focusFoot}>Your effort counts. Even when the plan changes.</p></div>}</dialog>
    {foodSearch && <FoodSearch date={date} preview={preview} recent={items} onSave={value => saveItem(value)} onClose={() => setFoodSearch(false)} onManual={() => itemEditor("food")} />}
    <dialog ref={dialog} className={s.dialog} onCancel={() => setEditor(null)} onClick={event => { if (event.target === event.currentTarget) setEditor(null); }}>{editor && <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>; try { if (await editor.submit(values)) setEditor(null); } catch { setNotice("Check the values and try again. Nothing was saved."); } }}><div className={s.between}><p className={s.eyebrow}>MAKE A LITTLE SPACE</p><button type="button" className={s.iconButton} aria-label="Close editor" onClick={() => setEditor(null)}><FiX /></button></div><h2>{editor.title}</h2><p>{editor.subtitle}</p><div className={s.formFields}>{editor.fields.map(field => <label key={field.name}><span>{field.label}</span>{field.options ? <select name={field.name} defaultValue={field.value}>{field.options.map(option => <option key={option}>{option}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} defaultValue={field.value} required={field.required} rows={5} maxLength={10000} /> : <input name={field.name} type={field.type ?? "text"} defaultValue={field.value} required={field.required} min={field.min} max={field.max} step={field.type === "number" ? "any" : undefined} maxLength={240} />}</label>)}</div>{notice && <p role="status">{notice}</p>}<div className={s.dialogActions}><button type="button" className={s.secondary} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className={s.primary} disabled={saving}>{saving ? "Saving…" : editor.fields.length ? "Save" : "Remove"}<FiCheck /></button></div></form>}</dialog>
  </div>;
}

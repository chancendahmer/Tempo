"use client";
import { loopDialogTab } from "./dialog-keyboard";

import Link from "next/link";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import { useRouter } from "next/navigation";
import { SectionArt } from "./SectionArt";
import { TodayView } from "./TodayView";
import { WorkspaceTour } from "./WorkspaceTour";
import { sections, groupForSection, WorkspaceSidebarNav, WorkspaceSectionNav, type Section } from "./WorkspaceNavigation";
import { RoutineEditor } from "./RoutineEditor";
import { WorkspaceMutationAttempts } from "./workspace-mutation-attempts";
import { NutritionView } from "./NutritionView";
import { TasksView, GoalsView } from "./PlanningViews";
import { FoodViews } from "./FoodViews";
import { FitnessView } from "./FitnessView";
import { CalendarView } from "./CalendarView";
import { ChatMessage } from "./ChatMessage";
import { SavedContextViews } from "./SavedContextViews";
import { WakeExperience } from "./WakeExperience";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiBookOpen, FiCalendar, FiCheck, FiCheckCircle, FiClock, FiEdit2, FiInbox, FiLogOut, FiMaximize, FiMenu, FiMessageCircle, FiMoon, FiPause, FiPlay, FiPlus, FiSend, FiChevronDown, FiChevronRight, FiSun, FiTrash2, FiX } from "react-icons/fi";
import { groceriesForMeals, ingredientKey } from "@/server/domain/meal-groceries";
import { lifeItemSchema, localDay, type LifeItem, type SavedLifeItem } from "@/server/domain/life-items";
import type { WorkspaceAction } from "@/server/db/repositories/workspace-repository";
import { previewWorkspace, type Workspace } from "./workspace-data";
import s from "./workspace.module.css";
import c from "./workspace-chrome.module.css";
import rb from "./rhythm-brain.module.css";

type Field = { name: string; label: string; type?: string; value?: string | number; options?: string[]; required?: boolean; min?: number; max?: number; minLength?: number; maxLength?: number };
type Editor = { title: string; subtitle: string; fields: Field[]; submit: (values: Record<string, string>) => Promise<boolean> };
type FocusData = Extract<LifeItem, { kind: "focus" }>;

export function WorkspaceClient({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Workspace | null>(null);
  const [section, setSection] = useState<Section>("today");
  const [tour, setTour] = useState(false);
  const mealTab = section === "recipes" ? "recipes" : section === "groceries" ? "groceries" : "plan";
  const [undo, setUndo] = useState<WorkspaceAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [routineEditor, setRoutineEditor] = useState<{ item?: SavedLifeItem } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [draft, setDraft] = useState("");
  const [focusHidden, setFocusHidden] = useState(false);
  const [hidden, setHidden] = useState(false);
  const busyRef = useRef(false);
  const mutationAttempts = useRef(new WorkspaceMutationAttempts());
  const requestSequence = useRef(0);
  const previewInitialized = useRef(false);
  const fastPollUntil = useRef(0);
  const lastPoll = useRef(0);
  const polling = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const focusDialog = useRef<HTMLDialogElement>(null);
  const chatRequest = useRef<{ text: string; id: string } | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobile) return;
    const opener = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? []).filter(element => element.getClientRects().length > 0);
    // Let the visible drawer style commit before focusing an off-canvas control.
    const focusFrame = requestAnimationFrame(() => controls()[0]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobile(false); }
      if (event.key !== "Tab") return;
      const elements = controls();
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const desktop = window.matchMedia("(min-width: 761px)");
    const onResize = () => { if (desktop.matches) setMobile(false); };
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
      opener?.focus();
    };
  }, [mobile]);

  const refresh = useCallback(async () => {
    if (preview) return;
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch(`/api/account/workspace${selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (sequence !== requestSequence.current) return;
      if (!response.ok) { if (response.status === 401) setData(null); setError(body.error ?? "Could not open your workspace."); return; }
      const pending = (body as Workspace).messages.filter(message => message.direction === "inbound" && ["received", "processing"].includes(message.status));
      fastPollUntil.current = pending.reduce((latest, message) => Math.max(latest, new Date(message.createdAt).getTime() + 120_000), 0);
      setData(body); setError("");
    } catch { if (sequence === requestSequence.current) { setError("Unable to refresh. Showing the last loaded view; reconnect to see current changes."); } }
  }, [preview, selectedDate]);

  useEffect(() => {
    const sequenceRef = requestSequence;
    const initial = setTimeout(() => {
      if (preview && !previewInitialized.current) { setData(previewWorkspace()); previewInitialized.current = true; }
      else if (!preview) void refresh();
      const initialSection = window.location.hash.slice(1);
      if (sections.some(([key]) => key === initialSection)) setSection(initialSection as Section);
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
    const onReturn = () => { if (document.visibilityState === "visible" && !busyRef.current) void refresh(); };
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { window.removeEventListener("focus", onReturn); window.removeEventListener("online", onReturn); document.removeEventListener("visibilitychange", onReturn); clearTimeout(initial); clearInterval(poll); clearInterval(clock); sequenceRef.current++; window.speechSynthesis?.cancel(); };
  }, [preview, refresh]);
  useEffect(() => {
    const onHash = () => { const key = window.location.hash.slice(1) || "today"; if (sections.some(([section]) => section === key)) { setSection(key as Section); window.scrollTo({ top: 0, behavior: "instant" }); } };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onHash); };
  }, []);
  useEffect(() => { if (editor) dialog.current?.showModal(); else dialog.current?.close(); }, [editor]);
  useEffect(() => { if (section === "assistant") chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [section, data?.messages.length]);

  const today = now ? localDay(now, data?.timezone ?? "UTC") : "";
  const date = selectedDate || today;
  const items = data?.items ?? [];
  const open = data?.tasks.filter(task => task.status !== "completed") ?? [];
  const routines = items.filter(item => item.data.kind === "routine");
  const focusItem = items.find(item => item.data.kind === "focus");
  const ongoing = open.find(task => task.status === "in_progress");
  const focus: FocusData | null = focusItem?.data.kind === "focus" ? focusItem.data : ongoing ? { kind: "focus", title: ongoing.title, taskId: ongoing.id, remaining: (ongoing.estimatedMinutes ?? 25) * 60, endsAt: new Date(new Date(ongoing.startedAt ?? now ?? new Date()).getTime() + (ongoing.estimatedMinutes ?? 25) * 60_000).toISOString() } : null;
  const focusVisible = Boolean(focus && !focusHidden && !hidden && data);
  useEffect(() => { if (focusVisible) focusDialog.current?.showModal(); else focusDialog.current?.close(); }, [focusVisible]);
  const remaining = focus ? focus.endsAt && now ? Math.min(focus.remaining, Math.max(0, Math.ceil((new Date(focus.endsAt).getTime() - now.getTime()) / 1000))) : focus.remaining : 0;
  const time = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: data?.timezone ?? "UTC", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const go = (value: Section) => {
    setSection(value); window.history.pushState(null, "", `#${value}`); setMobile(false); setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
    // Announce the destination and put keyboard users beside the page's controls.
    requestAnimationFrame(() => document.getElementById("workspace-content")?.focus({ preventScroll: true }));
  };
  const group = groupForSection(section)?.label;

  async function switchAccount() {
    if (busyRef.current) return;
    busyRef.current = true; setSaving(true); requestSequence.current++;
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out failed");
      setData(null);
      localStorage.removeItem("tempo-early-access-submitted");
      router.push("/login");
      router.refresh();
    } catch {
      setNotice("Could not sign out. Please try again.");
      busyRef.current = false; setSaving(false);
    }
  }

  async function act(action: WorkspaceAction): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true; setSaving(true); setUndo(null); requestSequence.current++;
    try {
      if (preview) {
        if (action.action === "chat") { setNotice("The preview doesn’t call AI or send messages. Log in to talk to your Tempo assistant."); return false; }
        setData(current => {
          if (!current) return current;
          const next = structuredClone(current);
          if (action.action === "save") {
            const prior = next.items.find(item => item.id === action.id);
            let saved = action.data;
            if (saved.kind === "meal") {
              const previous = prior?.data.kind === "meal" ? prior.data : undefined;
              const source = next.items.find(item => item.id === action.sourceRecipeId)?.data;
              saved = { ...saved, groceriesEnabled: saved.groceriesEnabled ?? previous?.groceriesEnabled ?? true,
                ingredientServings: source?.kind === "recipe" ? source.servings : previous?.ingredientServings ?? previous?.servings ?? saved.servings,
                ingredients: source?.kind === "recipe" ? source.ingredients : saved.ingredients };
            }
            next.items = next.items.filter(item => item.id !== action.id);
            next.items.unshift({ id: action.id, version: action.version + 1, data: saved });
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
          else if (action.action === "stop_focus") {
            if (action.focus) next.items = next.items.filter(item => item.id !== action.focus!.id);
            const task = next.tasks.find(task => task.id === action.task?.id);
            if (task) { task.status = "not_started"; task.startedAt = null; }
          }
          else if (action.action === "forget_memory") next.memories = next.memories?.filter(item => item.id !== action.id);
          else if (action.action === "remove_reminder") next.reminders = next.reminders.filter(item => item.id !== action.id);
          else if (action.action === "checkins") next.profile.proactiveOptIn = action.enabled;
          else if (action.action === "task") {
            const c = action.command;
            if (c.type === "create_task") next.tasks.push({ id: crypto.randomUUID(), title: c.title, estimatedMinutes: c.estimatedMinutes ?? null, dueAt: c.dueAt ?? null, status: "not_started", startedAt: null, goalId: c.goalId ?? null });
            else if (c.type !== "list_tasks") {
              const task = next.tasks.find(item => item.id === c.taskId);
              if (task) {
                if (c.type === "update_task") Object.assign(task, c.patch);
                else if (c.type === "start_task") { task.status = "in_progress"; task.startedAt = new Date().toISOString(); }
                else if (c.type === "reopen_task") { task.status = "not_started"; task.startedAt = null; }
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
          if (action.action === "save" || action.action === "delete") {
            const desired = groceriesForMeals(next.items, today);
            const generated = next.items.filter(item => item.data.kind === "grocery" && item.data.mealSources);
            next.items = next.items.filter(item => !(item.data.kind === "grocery" && item.data.mealSources));
            for (const [key, grocery] of desired) {
              const prior = generated.find(item => item.data.kind === "grocery" && ingredientKey(item.data) === key);
              next.items.push({ id: prior?.id ?? crypto.randomUUID(), version: (prior?.version ?? 0) + 1, data: { ...grocery, checked: prior?.data.kind === "grocery" ? prior.data.checked : false } });
            }
          }
          return next;
        });
        setNotice("Updated in preview. Sample changes reset on reload."); return true;
      }
      const attempt = mutationAttempts.current.begin(action);
      const response = await fetch("/api/account/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.action) });
      const body = await response.json();
      mutationAttempts.current.settle(attempt, response.status);
      if (!response.ok) { if (response.status === 401) setData(null); if (response.status === 409) await refresh(); throw new Error(body.error ?? "Could not save. Please try again."); }
      await refresh(); setNotice(body.message ?? "Saved."); return true;
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not save. Your changes have not been confirmed."); return false; }
    finally { busyRef.current = false; setSaving(false); }
  }
  const saveItem = (value: LifeItem, item?: SavedLifeItem, sourceRecipeId?: string) => {
    const parsed = lifeItemSchema.safeParse(value);
    if (!parsed.success) {
      setNotice(value.kind === "meal" && value.ingredients.length > 4000
        ? "This recipe’s ingredient list is too long for a meal plan. Shorten it to 4,000 characters, then try again. Your current meal is unchanged."
        : "Check the fields and keep values within the shown limits.");
      return Promise.resolve(false);
    }
    return act({ action: "save", ...(sourceRecipeId ? { sourceRecipeId } : {}), id: item?.id ?? crypto.randomUUID(), version: item?.version ?? 0, data: parsed.data });
  };
  const taskAction = (command: Extract<WorkspaceAction, { action: "task" }>["command"]) => act({ action: "task", requestId: crypto.randomUUID(), command });
  const goalAction = (command: Extract<WorkspaceAction, { action: "goal" }>["command"]) => act({ action: "goal", requestId: crypto.randomUUID(), command });

  function taskEditor(task?: Workspace["tasks"][number], goalId?: string, draft?: { title: string; estimatedMinutes: number }) {
    setNotice("");
    setEditor({ title: task ? "Make this task work for you" : "One small thing", subtitle: "A clear next step is enough. You can also ask Tempo by text.", fields: [
      { name: "title", label: "What would you like to do?", value: task?.title ?? draft?.title, required: true, minLength: 3 },
      { name: "minutes", label: "Estimated minutes", type: "number", value: task?.estimatedMinutes ?? draft?.estimatedMinutes ?? 25, min: 1, max: 1440 },
      { name: "due", label: `Schedule (device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`, type: "datetime-local", value: task?.dueAt ? new Date(new Date(task.dueAt).getTime() - new Date(task.dueAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "" },
    ], submit: values => taskAction(task ? { type: "update_task", taskId: task.id, patch: { title: values.title, estimatedMinutes: Number(values.minutes), dueAt: values.due ? new Date(values.due).toISOString() : null } } : { type: "create_task", title: values.title, estimatedMinutes: Number(values.minutes), ...(values.due ? { dueAt: new Date(values.due).toISOString() } : {}), ...(goalId ? { goalId } : {}) }) });
  }
  function goalEditor(goal?: Workspace["goals"][number], note?: Extract<LifeItem, { kind: "note" }>) {
    setNotice("");
    setEditor({ title: goal ? "Shape your goal" : "Something to work toward", subtitle: note ? "Shape a short goal from this thought. Your complete original note stays saved." : "Make it meaningful to you. Progress can be small.", fields: [{ name: "title", label: "Your goal", value: goal?.title ?? note?.title, required: true, minLength: 3 }, { name: "description", label: "Why it matters", type: "textarea", value: goal?.description ?? note?.body.slice(0, 1000) ?? "", maxLength: 1000 }], submit: v => goalAction(goal ? { type: "update_goal", goalId: goal.id, patch: { title: v.title, description: v.description || null } } : { type: "create_goal", title: v.title, ...(v.description ? { description: v.description } : {}) }) });
  }
  function itemEditor(kind: LifeItem["kind"], item?: SavedLifeItem, meal = "Breakfast") {
    setNotice("");
    if (kind === "routine") { setRoutineEditor({ item }); return; }
    const value = item?.data;
    const fields: Field[] = [{ name: "title", label: kind === "note" ? "What’s on your mind?" : "Name", value: value?.title, required: true }];
    if (["food", "meal", "workout"].includes(kind)) fields.push({ name: "date", label: "Date", type: "date", value: value && "date" in value ? value.date : date, required: true });
    if (kind === "food" || kind === "meal") fields.push({ name: "meal", label: "Meal", options: ["Breakfast", "Lunch", "Dinner", "Snack"], value: value && "meal" in value ? value.meal : meal });
    if (kind === "food") for (const key of ["calories", "protein", "carbs", "fat", "fiber"] as const) fields.push({ name: key, label: key === "calories" ? "Calories (kcal)" : `${key[0].toUpperCase()}${key.slice(1)} (g)`, type: "number", value: value?.kind === "food" ? value[key] ?? "" : "", min: 0, max: 10000 });
    if (kind === "meal") fields.push({ name: "ingredients", label: `Ingredients · one per line${value?.kind === "meal" && (value.ingredientServings || value.servings) ? ` · quantities for ${value.ingredientServings ?? value.servings} servings` : " · use your planned portions"}`, type: "textarea", value: value?.kind === "meal" ? value.ingredients : "" }, { name: "servings", label: "Servings (optional)", type: "number", min: 1, max: 100, value: value?.kind === "meal" ? value.servings ?? "" : "" });
    if (kind === "recipe") fields.push({ name: "ingredients", label: "Ingredients · one per line", type: "textarea", value: value?.kind === "recipe" ? value.ingredients : "", required: true }, { name: "instructions", label: "Preparation steps", type: "textarea", value: value?.kind === "recipe" ? value.instructions : "" }, { name: "servings", label: "Servings", type: "number", min: 1, max: 100, value: value?.kind === "recipe" ? value.servings : 1 }, { name: "prepMinutes", label: "Preparation time (minutes)", type: "number", min: 0, max: 1440, value: value?.kind === "recipe" ? value.prepMinutes : 15 });
    if (kind === "pantry" || kind === "grocery") fields.push({ name: "quantity", label: "Amount (optional)", type: "number", min: 0.001, max: 1000000, value: value && "quantity" in value ? value.quantity ?? "" : "" }, { name: "unit", label: "Unit", options: ["piece", "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "oz", "lb", "slice", "clove", "can", "package"], value: value && "unit" in value ? value.unit ?? "piece" : "piece" });
    if (kind === "note") fields.push({ name: "body", label: "A little more detail (optional)", type: "textarea", value: value?.kind === "note" ? value.body : "" });
    if (kind === "workout") fields.push({ name: "activity", label: "Movement", options: ["Walk", "Strength", "Cardio", "Mobility", "Other"], value: value?.kind === "workout" ? value.activity : "Walk" }, { name: "minutes", label: "Minutes", type: "number", value: value?.kind === "workout" ? value.minutes : 20, min: 1, max: 1440 });
    const titles: Record<string, string> = { recipe: "A meal worth remembering", routine: "Build a gentler rhythm", food: "Log what you ate", meal: "A little less dinner indecision", workout: "Every bit of movement counts", note: "Put it here. Let it go.", grocery: "Add to your shopping list", pantry: "What’s on hand?" };
    setEditor({ title: titles[kind], subtitle: kind === "food" ? "Use your food label for the portion you ate. Leave unknown nutrients blank. For database search, choose Search foods in your diary." : "Keep it simple. You can change this whenever you need.", fields, submit: async v => {
      const payload: Record<string, unknown> = { ...value, ...v, kind };
      if (kind === "food") for (const key of ["calories", "protein", "carbs", "fat", "fiber"]) payload[key] = v[key] === "" ? null : Number(v[key]);
      if (kind === "recipe") { payload.servings = Number(v.servings); payload.prepMinutes = Number(v.prepMinutes); payload.favorite = value?.kind === "recipe" ? value.favorite : true; }
      if (kind === "meal") { if (v.servings === "") delete payload.servings; else payload.servings = Number(v.servings); }
      if (kind === "pantry" || kind === "grocery") { if (v.quantity === "") delete payload.quantity; else payload.quantity = Number(v.quantity); }
      if (kind === "workout") payload.minutes = Number(v.minutes);
      if (kind === "grocery") payload.checked = value?.kind === "grocery" ? value.checked : false;
      const parsed = lifeItemSchema.safeParse(payload);
      if (!parsed.success) { setNotice("Check the fields and keep values within the shown limits."); return false; }
      return saveItem(parsed.data, item);
    } });
  }
  function planRecipe(item: SavedLifeItem) {
    if (item.data.kind !== "recipe") return;
    const recipe = item.data;
    if (recipe.ingredients.length > 4000) { setNotice("This recipe’s ingredient list is too long for a meal plan. Shorten it to 4,000 characters, then try again."); return; }
    setNotice("");
    setEditor({ title: "Plan a meal", subtitle: `${recipe.title}. Shopping ingredients scale from ${recipe.servings} servings to the portions you choose.`, fields: [
      { name: "date", label: "Date", type: "date", value: date, required: true },
      { name: "meal", label: "Meal", options: ["Breakfast", "Lunch", "Dinner", "Snack"], value: "Dinner" },
      { name: "servings", label: "Servings", type: "number", value: recipe.servings, min: 1, max: 100, required: true },
    ], submit: async values => { const ok = await saveItem(lifeItemSchema.parse({ kind: "meal", title: recipe.title, date: values.date, meal: values.meal, ingredients: recipe.ingredients, ingredientServings: recipe.servings, groceriesEnabled: true, servings: Number(values.servings) }), undefined, item.id); if (ok) { setSelectedDate(values.date); go("meals"); } return ok; } });
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
    const ok = await saveItem({ ...item.data, steps: item.data.steps.map(step => step.id === id ? { ...step, completedOn: step.completedOn === today ? null : today } : step) }, item);
    if (ok) { setNotice(preview ? "Routine progress updated in preview." : "Routine progress saved."); setUndo({ action: "save", id: item.id, version: item.version + 1, data: item.data }); }
    return ok;
  }
  async function stopFocus() {
    if (!focus) return;
    const task = data?.tasks.find(task => task.id === focus.taskId);
    const ok = await act({ action: "stop_focus", requestId: crypto.randomUUID(), ...(focusItem ? { focus: { id: focusItem.id, version: focusItem.version } } : {}), ...(task ? { task: { id: task.id, startedAt: task.startedAt } } : {}) });
    if (ok) { setFocusHidden(false); setNotice("Stopped for now. Your task or routine step is still unfinished."); }
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
  const itemActions = (item: SavedLifeItem) => <div className={s.row}><button className={s.iconButton} aria-label={`Edit ${item.data.title}`} onClick={() => itemEditor(item.data.kind, item)}><FiEdit2 /></button><button className={s.iconButton} aria-label={`Remove ${item.data.title}`} onClick={() => remove(item)}><FiTrash2 /></button></div>;
  const routineCard = (item: SavedLifeItem) => {
    if (item.data.kind !== "routine") return null;
    const routine = item.data;
    const count = routine.steps.filter(step => step.completedOn === today).length;
    const current = focus?.routineId === item.id ? routine.steps.find(step => step.id === focus.stepId && step.completedOn !== today) : undefined;
    const next = current ?? routine.steps.find(step => step.completedOn !== today);
    return <article className={rb.routine} data-period={routine.period} key={item.id}>
      <div className={rb.cardTop}><span className={rb.typeChip}><FiClock aria-hidden="true" />{routine.time}</span>{itemActions(item)}</div>
      <h3>{routine.title}</h3>
      <div className={rb.summary}><span>{count} of {routine.steps.length} steps complete</span><span>{routine.steps.reduce((n, step) => n + step.minutes, 0)} min · at your pace</span></div>
      <progress max={Math.max(1, routine.steps.length)} value={count} aria-label={`${routine.title} progress`} />
      {next ? <div className={rb.nextStep}><small>{current ? "Current step" : "Up next"}</small><strong>{next.title}</strong><button className={s.primary} disabled={saving} onClick={() => startRoutineStep(item, next.id)}><FiPlay />{current ? "Return to focus" : "Start next step"}<span>· {next.minutes} min</span></button></div> : <p className={rb.infoCopy}>All steps checked for today. You can uncheck any step below.</p>}
      {routine.steps.map(step => <div className={rb.step} data-complete={step.completedOn === today} key={step.id}><button type="button" className={rb.check} disabled={saving} aria-pressed={step.completedOn === today} aria-label={`${step.completedOn === today ? "Uncheck" : "Complete"} ${step.title}`} onClick={() => void routineCheck(item, step.id)}>{step.completedOn === today && <FiCheck />}</button><span>{step.title}<small>{step.minutes} min</small></span><button type="button" className={s.iconButton} aria-label={`Focus on ${step.title}`} disabled={saving || step.completedOn === today} onClick={() => startRoutineStep(item, step.id)}><FiPlay /></button></div>)}
      <small className={rb.routineHint}><FiCheckCircle /> Fresh checkmarks each day</small>
    </article>;
  };

  function startRoutineStep(item: SavedLifeItem, id: string) {
    if (item.data.kind !== "routine") return;
    const step = item.data.steps.find(step => step.id === id);
    if (!step) return;
    if (focus) { setFocusHidden(false); return; }
    void saveItem({ kind: "focus", title: step.title, routineId: item.id, stepId: id, remaining: step.minutes * 60, endsAt: new Date(new Date().getTime() + step.minutes * 60_000).toISOString() }).then(ok => { if (ok) setFocusHidden(false); });
  }
  return <div className={s.app} data-section={section}>
    <a className={s.skipLink} href="#workspace-content">Skip to content</a>
    <aside ref={sidebar} role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined} aria-label={mobile ? "Workspace navigation" : undefined} className={`${c.sidebar} ${mobile ? c.sidebarOpen : ""}`}><button className={`${s.iconButton} ${c.navigationClose}`} aria-label="Close menu" onClick={() => setMobile(false)}><FiX /></button><Link href={preview ? "/workspace/preview" : "/workspace"} className={c.brand}><WorkspaceAvatar size={34} />Tempo</Link>
      <WorkspaceSidebarNav current={section} go={go} />
      <div className={c.sidebarBottom}><button className={c.person} onClick={() => go("settings")} aria-label="Account and settings"><span>{data?.profile.displayName?.[0] ?? "Y"}</span><div><strong>{data?.profile.displayName ?? "Your account"}</strong><small>{preview ? "Preview account" : data?.profile.phoneLast4 ? `Phone •••• ${data.profile.phoneLast4}` : "Settings"}</small></div><FiChevronDown /></button><div className={c.accountActions}><button onClick={() => { setTour(true); setMobile(false); }} aria-label="Show me around"><FiBookOpen aria-hidden="true" />Guide</button>{!preview && <button disabled={saving} onClick={() => void switchAccount()}><FiLogOut /> Log out</button>}</div></div>
    </aside>
    {mobile && <button tabIndex={-1} className={c.scrim} aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <div className={c.main} inert={mobile || undefined}>
      <header className={c.topbar}><div className={c.topbarStart}><button ref={menuButton} className={`${s.iconButton} ${c.menuButton}`} aria-label="Open navigation" aria-expanded={mobile} onClick={() => setMobile(!mobile)}><FiMenu /></button><div className={c.breadcrumb}><span>{group ?? "Your workspace"}</span><FiChevronRight aria-hidden="true" /><strong>{sections.find(([key]) => key === section)?.[1]}</strong></div></div><div className={c.topbarActions}><button className={c.captureButton} aria-label="Capture a thought" onClick={() => itemEditor("note")} disabled={!data}><FiPlus /><span>Capture<span className={c.captureDetail}> a thought</span></span></button><button className={s.iconButton} title="Hide private content" aria-label="Hide private content" onClick={() => { setHidden(!hidden); window.speechSynthesis?.cancel(); }}><FiMoon /></button></div></header>
      {preview && <div className={s.previewBanner}><span>Alex’s demo · fictional data · resets on reload · no messages sent</span><Link href="/workspace">Open my account <FiArrowRight /></Link></div>}
      {error && data && <div className={s.foodNotice} role="alert">{error} <button className={s.textButton} onClick={() => void refresh()}>Try again</button></div>}
      {notice && <div className={s.toast} role="status"><WorkspaceAvatar size={28} /><span>{notice}</span>{undo && <button className={s.textButton} disabled={saving} onClick={() => void act(undo)}>Undo</button>}<button className={s.iconButton} aria-label="Dismiss message" onClick={() => setNotice("")}><FiX /></button></div>}
      {hidden ? <div className={s.gate}><FiMoon /><h1>A little privacy.</h1><button className={s.primary} onClick={() => setHidden(false)}>Show my workspace</button></div> : !data ? <div className={s.gate}><span className={s.gateIcon}><FiSun /></span><p className={s.eyebrow}>YOUR LIFE, A LITTLE LIGHTER</p><h1>Everything you need.<br />Room to breathe.</h1><p>{error || "Getting your space ready…"}</p><div className={s.row}><Link className={s.primary} href="/login">Log in to Tempo <FiArrowRight /></Link><Link className={s.secondary} href="/workspace/preview">Explore the workspace</Link></div>{error && <button className={s.textButton} onClick={() => void refresh()}>Try again</button>}</div> : <main className={c.content} id="workspace-content" aria-label={sections.find(([key]) => key === section)?.[1]} tabIndex={-1}>
        <WorkspaceSectionNav current={section} go={go} />
        <div key={section} className={c.page}>
        {section === "today" ? <>
          {now && <TodayView onResumeFocus={() => setFocusHidden(false)} preview={preview} data={data} now={now} saving={saving} go={go} editTask={taskEditor} startTask={task => void startFocus(task)} completeTask={task => void taskAction({ type: "complete_task", taskId: task.id })} checkStep={(item, id) => void routineCheck(item, id)} startStep={startRoutineStep} editRoutine={item => itemEditor("routine", item)} ask={ask} />}
        </> : <>
          <div className={s.pageHeading}><div><h1>{section === "nutrition" ? "Nutrition Tracker" : sections.find(([key]) => key === section)?.[1]}</h1><p>{({ tasks: "A clear next step, whenever you’re ready.", goals: "The bigger things you’re working toward.", calendar: "Your events, tasks, and reminders together.", routines: "A familiar start. An easier finish.", meals: "Decide once. Enjoy your week.", recipes: "Keep the meals you want to make again.", groceries: "One list for your next shop.", nutrition: "What you ate, all in one place.", movement: "Movement that fits your day.", memories: "What Tempo knows about you. You’re in control.", reminders: "See what’s coming. Clear what’s finished.", inbox: "A home for the things on your mind.", assistant: "Text naturally. Your plans stay connected.", wake: "Ease into your morning. Let the evening settle.", settings: "Choose what works for you." } as Record<string, string>)[section]}</p></div><SectionArt section={section} /></div>
          {section === "tasks" && <TasksView reopen={task => void taskAction({ type: "reopen_task", taskId: task.id })} remove={task => setEditor({ title: `Remove ${task.title}?`, subtitle: "This removes the task from your active list.", fields: [], submit: () => taskAction({ type: "abandon_task", taskId: task.id }) })} data={data} today={today} saving={saving} edit={taskEditor} start={task => void startFocus(task)} complete={task => void taskAction({ type: "complete_task", taskId: task.id })} />}
          {section === "goals" && <GoalsView remove={goal => setEditor({ title: `Remove ${goal.title}?`, subtitle: "Your linked tasks will stay on your list.", fields: [], submit: () => goalAction({ type: "abandon_goal", goalId: goal.id }) })} data={data} saving={saving} edit={goalEditor} addStep={id => taskEditor(undefined, id)} editStep={taskEditor} achieve={id => void goalAction({ type: "complete_goal", goalId: id })} />}
          {section === "calendar" && <CalendarView data={data} preview={preview} ask={ask} editTask={taskEditor} />}
          {section === "routines" && <section className={rb.rhythm} aria-label="Daily routines">
            <div className={rb.heading}><p>Check off each step as you go. Start fresh each day.</p><button className={s.primary} onClick={() => itemEditor("routine")}><FiPlus /> New routine</button></div>
            <div className={rb.periods}>{(["morning", "evening"] as const).map(period => <section className={rb.period} data-period={period} key={period} aria-label={`${period} routines`}><div className={rb.periodHeading}>{period === "morning" ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}<div><h2>{period === "morning" ? "Morning" : "Evening"}</h2><small>{period === "morning" ? "Find your beginning" : "Make room to wind down"}</small></div></div>{routines.filter(item => item.data.kind === "routine" && item.data.period === period).map(routineCard)}{!routines.some(item => item.data.kind === "routine" && item.data.period === period) && <div className={rb.periodEmpty}><p>{period === "morning" ? "A little support for the start of your day." : "A few familiar steps to close your day."}</p><button className={s.secondary} onClick={() => itemEditor("routine")}><FiPlus /> Build a routine</button></div>}</section>)}</div>
            <div className={rb.info}><FiMessageCircle /><span>Want a reminder by text? Ask Tempo to help you set one.</span><button className={s.textButton} onClick={() => ask("Remind me every day at 8 am to start my morning routine.")}>Ask Tempo <FiArrowRight /></button></div>
          </section>}

          {(["meals", "recipes", "groceries"] as Section[]).includes(section) && <FoodViews tab={mealTab} items={items} date={date} today={today} setDate={setSelectedDate} saving={saving} edit={itemEditor} plan={planRecipe} actions={itemActions} save={saveItem} ask={ask} />}
          {(["nutrition", "movement"] as Section[]).includes(section) && !preview && selectedDate && data.diaryCoverage?.date !== selectedDate && <p role="status">Loading this day’s saved entries…</p>}
          {(["nutrition", "movement"] as Section[]).includes(section) && data.itemsTruncated && <p role="status">Your full history is saved. This view includes recent entries and the selected day. Select a date to see older entries.</p>}
          {section === "nutrition" && data.diaryCoverage?.food.truncated && <p role="alert">This day has more entries than the display limit. Totals below are incomplete.</p>}
          {section === "nutrition" && (preview || !selectedDate || data.diaryCoverage?.date === selectedDate) && <NutritionView items={items} date={date} today={today} setDate={setSelectedDate} saving={saving} preview={preview} save={saveItem} remove={remove} />}
          {section === "movement" && (preview || !selectedDate || data.diaryCoverage?.date === selectedDate) && <FitnessView save={saveItem} remove={remove} data={data} today={today} date={date} setDate={setSelectedDate} saving={saving} plan={draft => taskEditor(undefined, undefined, draft)} log={() => itemEditor("workout")} actions={itemActions} showTasks={() => go("tasks")} />}
          {section === "inbox" && <section className={rb.brain} aria-label="Saved thoughts">
            <div className={rb.capture}><FiInbox aria-hidden="true" /><div><h2>Out of your head. Saved here.</h2><p>Keep a loose end, an idea, or something for later.</p></div><button className={s.primary} onClick={() => itemEditor("note")}><FiPlus /> Capture a thought</button></div>
            <div className={rb.noteGrid}>{items.filter(item => item.data.kind === "note").map(item => <article className={rb.note} key={item.id}><div className={rb.cardTop}><span className={rb.typeChip}>Saved thought</span>{itemActions(item)}</div><h3>{item.data.title}</h3>{item.data.kind === "note" && <details><summary>{item.data.body.slice(0, 100) || "Open note"}{item.data.body.length > 100 ? "…" : ""}</summary><p>{item.data.body}</p></details>}<div className={rb.rowActions}><button className={s.textButton} disabled={saving} onClick={() => taskEditor(undefined, undefined, { title: item.data.title, estimatedMinutes: 15 })}>Add to To-do <FiArrowRight /></button><button className={s.textButton} disabled={saving} onClick={() => { if (item.data.kind === "note") goalEditor(undefined, item.data); }}>Make a goal <FiArrowRight /></button></div></article>)}</div>
            {!items.some(item => item.data.kind === "note") && empty("A place for the loose ends", "Nothing captured yet. You can add a thought here or text Tempo.", () => itemEditor("note"), "Capture a thought")}
          </section>}
          {section === "assistant" && <div className={rb.assistant}>
            <article className={rb.conversation}><div className={rb.chatHeader}><WorkspaceAvatar size={38} /><div><strong>Tempo</strong><small>{preview ? "Scripted example · no AI calls" : "Your shared web & text conversation"}</small></div></div>
              <div className={rb.messages}>{!data.messages.length && empty("Start wherever you are", "Try asking for one manageable next step.")}{data.messages.map(message => <div key={message.id} className={rb.message} data-direction={message.direction}><small>{message.direction === "inbound" ? "You" : "Tempo"} · {time(message.createdAt)}</small><ChatMessage body={message.body} />{["received", "processing"].includes(message.status) && <small role="status">{now && now.getTime() - new Date(message.createdAt).getTime() > 30_000 ? "Your message is saved. Tempo is taking longer than usual; no need to resend." : "Tempo is working on your message…"}</small>}</div>)}<div ref={chatEnd} /></div>
              <form className={rb.composer} onSubmit={async e => { e.preventDefault(); if (!chatRequest.current || chatRequest.current.text !== draft) chatRequest.current = { text: draft, id: crypto.randomUUID() }; if (await act({ action: "chat", requestId: chatRequest.current.id, text: draft })) { setDraft(""); chatRequest.current = null; } }}><textarea aria-label="Message Tempo" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} placeholder="Add a task, change a plan, tell me what’s on your mind…" rows={2} required /><button className={s.primary} disabled={saving || !draft.trim()} type="submit" aria-label="Send message"><FiSend /></button></form><small className={rb.chatHint}>{preview ? "Scripted conversation. Try the workspace controls; AI replies require a real account." : "Calendar edits ask first · Replies refresh automatically"}</small>
            </article>
            <details className={rb.starters}><summary>Need a place to start?</summary><div className={rb.promptRow}>{[{ label: "Pick a task", text: "Help me choose one task to start.", icon: FiCheckCircle }, { label: "My routine", text: "Show me my morning routine.", icon: FiSun }, { label: "Set a reminder", text: "Help me set a reminder.", icon: FiClock }, { label: "Today’s calendar", text: "What’s on my calendar today?", icon: FiCalendar }, { label: "Save a thought", text: "Save a note: ", icon: FiInbox }].map(({ label, text, icon: Icon }) => <button className={rb.prompt} key={label} onClick={() => setDraft(text)}><Icon /><span>{label}</span></button>)}</div><p>Manage your tasks, goals, routines, and logs; find foods and save recipes. Calendar changes need confirmation. Missing nutrients stay unknown.</p></details>
          </div>}

          {(section === "memories" || section === "reminders") && <SavedContextViews key={section} section={section} data={data} saving={saving} ask={ask} remove={(action, title) => setEditor({ title: `Remove “${title}”?`, subtitle: action.action === "forget_memory" ? "This removes the saved fact. Conversation history stays unchanged." : "This removes the reminder. Messages already delivered stay in your conversation.", fields: [], submit: () => act(action) })} />}
          {section === "wake" && <div className={rb.rhythm}><WakeExperience onRoutines={() => go("routines")} /></div>}
          {section === "settings" && <div className={s.twoColumns}><article className={s.card}><span className={`${s.tileIcon} ${s.sage}`}><FiMessageCircle /></span><h2>Text check-ins</h2><label className={s.toggleRow}><span><strong>Proactive check-ins</strong><small>Optional · quiet hours respected</small></span><input type="checkbox" checked={data.profile.proactiveOptIn} disabled={saving} onChange={e => void act({ action: "checkins", enabled: e.target.checked })} /></label><details className={s.inlineDetails}><summary>Quiet hours & delivery</summary><p className={s.finePrint}>Quiet hours: {data.profile.quietHoursStart?.slice(0, 5) ?? "not set"}–{data.profile.quietHoursEnd?.slice(0, 5) ?? "not set"} · {data.timezone}. Includes occasional reviews of overdue or untouched items. Tempo asks before removing anything. Actual outreach also depends on the configured worker and sending controls.</p></details><Link className={s.secondary} href="/profile">Profile & coaching instructions <FiArrowRight /></Link></article><article className={s.card}><span className={`${s.tileIcon} ${s.amber}`}><FiMaximize /></span><h2>Whiteboard & audio</h2><div className={s.settingButtons}><button className={s.secondary} onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setNotice("Use your browser’s full-screen control on this device."); } }}><FiMaximize /> Toggle full screen</button><button className={s.secondary} onClick={readBriefing}><FiSun /> Read my day aloud</button><button className={s.textButton} onClick={() => window.speechSynthesis?.cancel()}>Stop audio</button></div><small>Audio begins only when you ask. Scheduled spoken announcements are not enabled.</small></article><article className={s.card}><FiCalendar /><h2>Connections</h2><p>Google Calendar: {preview ? "sample connection" : data.calendar?.status === "active" ? "connected" : "not connected"}</p><Link className={s.secondary} href="/extensions">Manage connections <FiArrowRight /></Link><details className={s.inlineDetails}><summary>Available integrations</summary><p>Food search and barcodes use Open Food Facts. MyFitnessPal, wearable, and health-app account imports are not connected.</p></details></article><article className={s.card}><FiBookOpen /><h2>Privacy</h2><details className={s.inlineDetails}><summary>What to keep here</summary><p>Everyday notes belong here. Keep passwords, medical records, and sensitive documents in a dedicated secure service.</p></details><button className={s.textButton} onClick={() => setHidden(true)}>Hide this workspace <FiMoon /></button></article></div>}
        </>}
        </div>
        {section !== "assistant" && <form className={c.everywhereComposer} onSubmit={async e => { e.preventDefault(); if (!chatRequest.current || chatRequest.current.text !== draft) chatRequest.current = { text: draft, id: crypto.randomUUID() }; if (await act({ action: "chat", requestId: chatRequest.current.id, text: draft })) { setDraft(""); chatRequest.current = null; go("assistant"); } }}><WorkspaceAvatar size={38} /><input aria-label="Ask Tempo from anywhere" value={draft} onChange={e => setDraft(e.target.value)} placeholder="What would you like to add or change?" maxLength={2000} required /><button className={s.primary} type="submit" aria-label="Send to Tempo" disabled={saving || !draft.trim()}><FiSend /><span>Send</span></button></form>}
        <footer className={c.footer}><span>{preview ? "Try the controls. Your real account stays unchanged." : "Your texts and dashboard share the same account."}</span><button className={s.textButton} onClick={() => go("assistant")}>You can always just ask <FiMessageCircle /></button></footer>
      </main>}
      {focus && focusHidden && !hidden && <button className={s.focusDock} onClick={() => setFocusHidden(false)}><FiPlay /><span>{focus.title}</span><strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong><FiMaximize /></button>}
    </div>
    <dialog onKeyDown={loopDialogTab} ref={focusDialog} className={s.focusDialog} onCancel={() => setFocusHidden(true)} aria-label="Current focus session">{focus && data && <div className={s.focusOverlay}><div className={s.focusTop}><span className={s.brand}><WorkspaceAvatar size={39} />Tempo</span><button className={s.secondary} onClick={() => setFocusHidden(true)}><FiArrowLeft /> Back to my day</button></div><div className={s.focusCenter}><p className={s.eyebrow}>{remaining ? "JUST THIS. JUST NOW." : "A MOMENT TO CHECK IN"}</p><h1>{focus.title}</h1><p>{remaining ? "The rest can wait. You’re in the right place." : "Time is up. Finished, or would a little more time help?"}</p><div className={s.timerRing}><span role="timer" aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}>{Math.floor(remaining / 60)}<i>:</i>{String(remaining % 60).padStart(2, "0")}</span><small>{focus.endsAt ? "one small step at a time" : "paused · take the time you need"}</small></div><div className={s.focusActions}><button className={s.secondary} disabled={saving} onClick={() => void saveItem({ ...focus, remaining, endsAt: focus.endsAt ? null : new Date(Date.now() + remaining * 1000).toISOString() }, focusItem)}>{focus.endsAt ? <FiPause /> : <FiPlay />}{focus.endsAt ? "Pause" : "Resume"}</button><button className={s.darkButton} disabled={saving} onClick={() => void finishFocus()}><FiCheck /> I’m done</button><button className={s.secondary} disabled={saving} onClick={() => void saveItem({ ...focus, remaining: remaining + 300, endsAt: new Date(Date.now() + (remaining + 300) * 1000).toISOString() }, focusItem)}>+ 5 minutes</button></div><button className={s.textButton} disabled={saving} onClick={() => void stopFocus()}>Stop for now</button><button className={s.textButton} onClick={() => { setFocusHidden(true); ask("I’m stuck on my current task. Help me make the next step smaller."); }}>Feeling stuck? Let’s make it smaller <FiArrowRight /></button></div><p className={s.focusFoot}>Your effort counts. Even when the plan changes.</p></div>}</dialog>
    {tour && <WorkspaceTour onClose={() => setTour(false)} onGo={value => { go(value); setTour(false); }} />}
    {routineEditor && <RoutineEditor key={`${routineEditor.item?.id ?? "new-routine"}-${routineEditor.item?.version ?? 0}`} item={routineEditor.item} latestItem={items.find(item => item.id === routineEditor.item?.id)} saveError={notice} onReload={item => { setNotice(""); setRoutineEditor({ item }); }} timezone={data?.timezone ?? "UTC"} saving={saving} onSave={saveItem} onClose={() => setRoutineEditor(null)} />}
    <dialog onKeyDown={loopDialogTab} ref={dialog} className={s.dialog} aria-label={editor?.title ?? "Edit item"} onCancel={() => setEditor(null)} onClick={event => { if (event.target === event.currentTarget) setEditor(null); }}>{editor && <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>; try { if (await editor.submit(values)) setEditor(null); } catch { setNotice("Check the values and try again. Nothing was saved."); } }}><div className={s.between}><p className={s.eyebrow}>MAKE A LITTLE SPACE</p><button type="button" className={s.iconButton} aria-label="Close editor" onClick={() => setEditor(null)}><FiX /></button></div><h2>{editor.title}</h2><p>{editor.subtitle}</p><div className={s.formFields}>{editor.fields.map(field => <label key={field.name}><span>{field.label}</span>{field.options ? <select name={field.name} defaultValue={field.value}>{field.options.map(option => <option key={option}>{option}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} defaultValue={field.value} required={field.required} rows={5} minLength={field.minLength} maxLength={field.maxLength ?? 10000} /> : <input name={field.name} type={field.type ?? "text"} defaultValue={field.value} required={field.required} min={field.min} max={field.max} step={field.type === "number" ? "any" : undefined} minLength={field.minLength} maxLength={field.maxLength ?? 240} />}</label>)}</div>{notice && <p role="status">{notice}</p>}<div className={s.dialogActions}><button type="button" className={s.secondary} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className={s.primary} disabled={saving}>{saving ? "Saving…" : editor.fields.length ? "Save" : "Remove"}<FiCheck /></button></div></form>}</dialog>
  </div>;
}

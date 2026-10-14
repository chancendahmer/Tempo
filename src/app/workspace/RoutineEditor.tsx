"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FiArrowDown, FiArrowUp, FiClock, FiMoon, FiPlus, FiSun, FiTrash2, FiX } from "react-icons/fi";
import { lifeItemSchema, type LifeItem, type SavedLifeItem } from "../../server/domain/life-items";
import s from "./routine-editor.module.css";
import { loopDialogTab } from "./dialog-keyboard";

type Routine = Extract<LifeItem, { kind: "routine" }>;
export type RoutineDraft = {
  title: string;
  period: "morning" | "evening";
  time: string;
  steps: { key: string; sourceId?: string; title: string; minutes: string }[];
};

/** Keep step identity through reordering; a renamed step starts fresh. */
export function buildRoutineDraft(draft: RoutineDraft, item?: SavedLifeItem, newId: () => string = () => crypto.randomUUID()): Routine {
  if (item && item.data.kind !== "routine") throw new Error("This item is not a routine. Close this editor and try again.");
  if (!draft.title.trim()) throw new Error("Give your routine a name.");
  if (draft.title.trim().length > 240) throw new Error("Keep the routine name under 241 characters.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) throw new Error("Choose a start time for your routine.");
  if (draft.steps.length === 0) throw new Error("Add at least one step to your routine.");
  if (draft.steps.length > 30) throw new Error("Keep your routine to 30 steps or fewer.");
  const previous = item?.data.kind === "routine" ? item.data.steps : [];
  const retained = new Set<string>();
  const steps = draft.steps.map((step, index) => {
    const title = step.title.trim();
    const minutes = Number(step.minutes);
    if (!title) throw new Error(`Give step ${index + 1} a name, or remove it.`);
    if (title.length > 240) throw new Error(`Keep step ${index + 1} under 241 characters.`);
    if (!step.minutes.trim() || !Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw new Error(`Choose a whole number from 1 to 180 minutes for step ${index + 1}.`);
    const original = previous.find(value => value.id === step.sourceId && value.title.trim() === title && !retained.has(value.id));
    if (original) retained.add(original.id);
    return { id: original?.id ?? newId(), title, minutes, completedOn: original?.completedOn ?? null };
  });
  return lifeItemSchema.parse({ kind: "routine", title: draft.title.trim(), period: draft.period, time: draft.time, steps }) as Routine;
}

function initialDraft(item?: SavedLifeItem): RoutineDraft {
  const value = item?.data.kind === "routine" ? item.data : undefined;
  return {
    title: value?.title ?? "",
    period: value?.period ?? "morning",
    time: value?.time ?? "08:00",
    steps: value?.steps.map(step => ({ key: step.id, sourceId: step.id, title: step.title, minutes: String(step.minutes) })) ?? [{ key: "first-step", title: "", minutes: "2" }],
  };
}

export function RoutineEditor({ item, latestItem, saveError, timezone, saving, onSave, onClose, onReload }: {
  item?: SavedLifeItem;
  latestItem?: SavedLifeItem;
  saveError?: string;
  timezone: string;
  saving: boolean;
  onSave: (value: LifeItem, item?: SavedLifeItem) => Promise<boolean>;
  onClose: () => void;
  onReload: (item: SavedLifeItem) => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(item));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const addedStep = useRef<string | null>(null);
  const nextKey = useRef(0);
  const id = useId();
  const busy = saving || pending;
  const conflict = Boolean(item && (!latestItem || latestItem.version !== item.version));
  const total = draft.steps.reduce((sum, step) => sum + (Number.isInteger(Number(step.minutes)) && Number(step.minutes) > 0 ? Number(step.minutes) : 0), 0);

  useEffect(() => {
    const current = dialog.current;
    if (current && !current.open) current.showModal();
    name.current?.focus();
    return () => { if (current?.open) current.close(); };
  }, []);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);
  useEffect(() => {
    if (addedStep.current) {
      document.getElementById(addedStep.current)?.focus();
      addedStep.current = null;
    }
  }, [draft.steps]);

  function updateStep(key: string, change: { title?: string; minutes?: string }) {
    setDraft(current => ({ ...current, steps: current.steps.map(step => step.key === key ? { ...step, ...change } : step) }));
    setError("");
  }
  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    setDraft(current => {
      const steps = [...current.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...current, steps };
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || saving || conflict) return;
    setError("");
    let value: Routine;
    try { value = buildRoutineDraft(draft, item); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check the routine name and each step, then try again."); return; }
    submitting.current = true;
    setPending(true);
    try {
      if (await onSave(value, item)) onClose();
      else setError("Your routine wasn’t saved. Your edits are still here — please try again.");
    } catch {
      setError("Your routine wasn’t saved. Check your connection and try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <dialog className={s.dialog} ref={dialog} onKeyDown={loopDialogTab} aria-labelledby={`${id}-heading`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form className={s.form} noValidate onSubmit={event => void submit(event)}>
      <header className={s.header}>
        <div><h2 id={`${id}-heading`}>{item ? "Edit routine" : "Build a routine"}</h2><p id={`${id}-description`}>A few familiar steps, at your pace.</p></div>
        <button className={s.iconButton} type="button" onClick={onClose} disabled={busy} aria-label="Close routine editor"><FiX aria-hidden="true" /></button>
      </header>
      <div className={s.body}>
        {conflict && <div className={s.error} role="alert"><p>{latestItem ? "This routine changed elsewhere. Your unsaved edits are still shown below." : "This routine was removed elsewhere. Your unsaved edits are still shown below; close the editor when you’re ready."}</p>{latestItem && <button type="button" className={s.cancelButton} disabled={busy} onClick={() => onReload(latestItem)}>Discard my edits and load latest</button>}</div>}
        {error && !conflict && <p ref={errorMessage} tabIndex={-1} className={s.error} role="alert">{saveError || error}</p>}
        <fieldset className={s.fields} disabled={busy}>
          <label className={s.field} htmlFor={`${id}-name`}>Routine name<input ref={name} id={`${id}-name`} value={draft.title} onChange={event => { setDraft(current => ({ ...current, title: event.target.value })); setError(""); }} placeholder="Morning routine" maxLength={240} required autoComplete="off" /></label>
          <div className={s.schedule}>
            <fieldset className={s.period}><legend>Time of day</legend>
              <label data-selected={draft.period === "morning"}><input type="radio" name={`${id}-period`} checked={draft.period === "morning"} onChange={() => setDraft(current => ({ ...current, period: "morning" }))} /><FiSun aria-hidden="true" /> Morning</label>
              <label data-selected={draft.period === "evening"}><input type="radio" name={`${id}-period`} checked={draft.period === "evening"} onChange={() => setDraft(current => ({ ...current, period: "evening" }))} /><FiMoon aria-hidden="true" /> Evening</label>
            </fieldset>
            <label className={s.field} htmlFor={`${id}-time`}>Start time<input id={`${id}-time`} type="time" value={draft.time} onChange={event => { setDraft(current => ({ ...current, time: event.target.value })); setError(""); }} required /><small>{timezone.replaceAll("_", " ")}</small></label>
          </div>
          <div className={s.stepsHeading}><h3>Your steps</h3><span><FiClock aria-hidden="true" />{total} min total</span></div>
          <ol className={s.steps}>
            {draft.steps.map((step, index) => <li className={s.step} key={step.key}>
              <span className={s.number} aria-hidden="true">{index + 1}</span>
              <div className={s.stepFields}>
                <label className={s.field} htmlFor={`${id}-${step.key}`}>Step {index + 1}<input id={`${id}-${step.key}`} value={step.title} onChange={event => updateStep(step.key, { title: event.target.value })} placeholder="e.g. Drink a glass of water" maxLength={240} required autoComplete="off" /></label>
                <label className={s.field} htmlFor={`${id}-${step.key}-minutes`}>Minutes<input id={`${id}-${step.key}-minutes`} type="number" inputMode="numeric" value={step.minutes} onChange={event => updateStep(step.key, { minutes: event.target.value })} min={1} max={180} step={1} required /></label>
              </div>
              <div className={s.stepControls}>
                <button className={s.iconButton} type="button" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label={`Move step ${index + 1} up`} title="Move up"><FiArrowUp aria-hidden="true" /></button>
                <button className={s.iconButton} type="button" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)} aria-label={`Move step ${index + 1} down`} title="Move down"><FiArrowDown aria-hidden="true" /></button>
                <button className={s.removeButton} type="button" onClick={() => { setDraft(current => ({ ...current, steps: current.steps.filter(value => value.key !== step.key) })); setError(""); }} aria-label={`Remove step ${index + 1}${step.title.trim() ? `: ${step.title.trim()}` : ""}`} title="Remove step"><FiTrash2 aria-hidden="true" /></button>
              </div>
            </li>)}
          </ol>
          {draft.steps.length === 0 && <p className={s.emptySteps}>Add your first step below.</p>}
          <button className={s.addStep} type="button" disabled={draft.steps.length >= 30} onClick={() => {
            nextKey.current += 1;
            const key = `new-${nextKey.current}`;
            addedStep.current = `${id}-${key}`;
            setDraft(current => ({ ...current, steps: [...current.steps, { key, title: "", minutes: "2" }] }));
            setError("");
          }}><FiPlus aria-hidden="true" /> Add step</button>
          {draft.steps.length >= 30 && <p className={s.limit}>You’ve reached 30 steps. Edit or remove a step to make room.</p>}
        </fieldset>
      </div>
      <footer className={s.footer}><button className={s.cancelButton} type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={s.saveButton} type="submit" disabled={busy || conflict}>{busy ? "Saving…" : "Save routine"}</button></footer>
    </form>
  </dialog>;
}

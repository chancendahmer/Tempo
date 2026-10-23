"use client";
import { useEffect, useRef, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { lifeItemSchema, type LifeItem, type SavedLifeItem } from "../../server/domain/life-items";
import { loopDialogTab } from "./dialog-keyboard";
import ui from "./workspace.module.css";
import s from "./food-fitness.module.css";

export type WorkoutLog = Extract<LifeItem, { kind: "workout" }>;
export function buildWorkoutLog(values: { title: string; date: string; minutes: string; activity: WorkoutLog["activity"]; notes: string }, today: string, original?: Partial<WorkoutLog>): WorkoutLog {
  if (values.date > today) throw new Error("Choose today or an earlier date for completed movement.");
  if (!Number.isInteger(Number(values.minutes)) || Number(values.minutes) < 1 || Number(values.minutes) > 1440) throw new Error("Enter 1–1,440 whole minutes you actually completed.");
  const result = lifeItemSchema.safeParse({ ...original, ...values, kind: "workout", minutes: Number(values.minutes) });
  if (!result.success) throw new Error("Add a movement name and valid date, and keep notes under 4,001 characters.");
  return result.data as WorkoutLog;
}

export function WorkoutLogEditor({ date, today, draft, item, latestItem, saving, save, close }: {
  date: string; today: string; draft?: Partial<WorkoutLog>; item?: SavedLifeItem; latestItem?: SavedLifeItem; saving: boolean;
  save: (data: LifeItem, item?: SavedLifeItem) => Promise<boolean>; close: () => void;
}) {
  const original = item?.data.kind === "workout" ? item.data : draft;
  const [values, setValues] = useState(() => ({ title: original?.title ?? "", date: original?.date ?? (date > today ? today : date), minutes: original?.minutes?.toString() ?? "", activity: original?.activity ?? "Walk" as WorkoutLog["activity"], notes: original?.notes ?? "" }));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const conflict = !!item && (!latestItem || item.version !== latestItem.version);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`${ui.dialog} ${s.dialog}`} onCancel={close} onKeyDown={loopDialogTab} aria-label="Log completed movement"><div className={ui.between}><div><p className={ui.eyebrow}>EVERY BIT COUNTS</p><h2>{item ? "Edit completed movement" : "What did you do?"}</h2></div><button className={ui.iconButton} onClick={close} aria-label="Close movement log"><FiX /></button></div><form className={s.form} onSubmit={async e => { e.preventDefault(); if (saving || submitting.current || conflict) return; setError(""); try { const value = buildWorkoutLog(values, today, original); submitting.current = true; setPending(true); if (await save(value, item)) close(); else setError("This movement wasn’t saved. Check the workspace message and try again."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not log this movement."); } finally { setPending(false); submitting.current = false; } }}>
    <p className={s.info}>Record what you actually completed. Enter the time yourself; planned duration is only a starting point.</p><div className={s.fields}><label className={s.wide}>Movement name<input autoFocus required maxLength={240} value={values.title} onChange={e => setValues(current => ({ ...current, title: e.target.value }))} /></label><label>Date completed<input required type="date" max={today} value={values.date} onChange={e => setValues(current => ({ ...current, date: e.target.value }))} /></label><label>Minutes completed<input required type="number" min="1" max="1440" step="1" value={values.minutes} onChange={e => setValues(current => ({ ...current, minutes: e.target.value }))} /></label><label>Activity<select value={values.activity} onChange={e => setValues(current => ({ ...current, activity: e.target.value as WorkoutLog["activity"] }))}>{["Walk", "Strength", "Cardio", "Mobility", "Other"].map(value => <option key={value}>{value}</option>)}</select></label></div><label className={s.field}>Notes (optional)<textarea maxLength={4000} placeholder="Sets, repetitions, how it felt, or what you changed" value={values.notes} onChange={e => setValues(current => ({ ...current, notes: e.target.value }))} /></label>
    {conflict && <p role="alert" className={s.error}>This entry changed or was removed elsewhere. Close this editor and reopen the latest entry before saving.</p>}{error && <p role="alert" className={s.error}>{error}</p>}<div className={s.actions}><button type="submit" className={ui.primary} disabled={saving || pending || conflict}><FiCheck />{pending ? "Saving…" : "Save completed movement"}</button><button type="button" className={ui.secondary} onClick={close}>Cancel</button></div>
  </form></dialog>;
}

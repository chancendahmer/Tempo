"use client";
import { useEffect, useId, useRef, useState } from "react";
import { FiCheck, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { lifeItemSchema, type LifeItem, type SavedLifeItem } from "../../server/domain/life-items";
import { exerciseAlternative, type WorkoutProgram } from "./workout-programs";
import { loopDialogTab } from "./dialog-keyboard";
import ui from "./workspace.module.css";
import s from "./food-fitness.module.css";

export type WorkoutPlan = Extract<LifeItem, { kind: "workout_plan" }>;
export type WorkoutPlanDraft = { title: string; templateId: string; sessions: { name: string; minutes: string; exercises: { name: string; dose: string }[] }[] };
export function buildWorkoutPlan(draft: WorkoutPlanDraft): WorkoutPlan {
  if (!draft.title.trim()) throw new Error("Give your plan a name.");
  if (!draft.sessions.length) throw new Error("Add at least one session.");
  if (new Set(draft.sessions.map(session => session.name.trim().toLowerCase())).size !== draft.sessions.length) throw new Error("Give each session a different name.");
  const sessions = draft.sessions.map((session, index) => {
    const minutes = Number(session.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error(`Choose 1–1,440 whole minutes for session ${index + 1}.`);
    if (!session.exercises.length) throw new Error(`Add a movement to session ${index + 1}.`);
    return { ...session, minutes };
  });
  const result = lifeItemSchema.safeParse({ ...draft, sessions, kind: "workout_plan" });
  if (!result.success) throw new Error("Name each session and movement, add its sets or duration, and keep names under 241 characters.");
  return result.data as WorkoutPlan;
}

export function WorkoutPlanEditor({ program, item, latestItem, saving, save, close }: {
  program: WorkoutProgram; item?: SavedLifeItem; latestItem?: SavedLifeItem; saving: boolean;
  save: (data: LifeItem, item?: SavedLifeItem) => Promise<boolean>; close: () => void;
}) {
  const original = item?.data.kind === "workout_plan" ? item.data : null;
  const [draft, setDraft] = useState<WorkoutPlanDraft>(() => ({ title: original?.title ?? program.title, templateId: original?.templateId ?? program.id, sessions: (original?.sessions ?? program.sessions).map(session => ({ ...session, minutes: String(session.minutes), exercises: session.exercises.map(exercise => ({ name: exercise.name, dose: exercise.dose })) })) }));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const submitting = useRef(false);
  const conflict = !!item && (!latestItem || latestItem.version !== item.version);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function updateSession(index: number, update: Partial<WorkoutPlanDraft["sessions"][number]>) { setDraft(current => ({ ...current, sessions: current.sessions.map((session, i) => i === index ? { ...session, ...update } : session) })); }
  return <dialog ref={dialog} className={`${ui.dialog} ${s.dialog}`} onCancel={close} onKeyDown={loopDialogTab} aria-label={item ? "Customize saved workout plan" : "Adopt workout plan"}>
    <div className={`${ui.between} ${s.planEditorHeading}`}><div><p className={ui.eyebrow}>MAKE IT YOURS</p><h2>{item ? "Customize your plan" : "Save a starting point"}</h2></div><div className={s.actions}><button type="submit" form={formId} className={ui.primary} disabled={saving || pending || conflict}><FiCheck />{pending ? "Saving…" : "Save plan"}</button><button className={ui.iconButton} onClick={close} aria-label="Close workout plan editor"><FiX /></button></div></div>
    <form id={formId} className={s.form} onSubmit={async e => { e.preventDefault(); if (saving || submitting.current || conflict) return; setError(""); try { const value = buildWorkoutPlan(draft); submitting.current = true; setPending(true); if (await save(value, item)) close(); else setError("Your plan wasn’t saved. Check the workspace message and try again."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your plan."); } finally { setPending(false); submitting.current = false; } }}>
      <p className={s.info}>Adjust movements, sets and duration. Saving keeps the plan in your workspace. Schedule a session from your saved plan when you are ready.</p>
      <label className={s.field}>Plan name<input autoFocus required maxLength={240} value={draft.title} onChange={e => setDraft(current => ({ ...current, title: e.target.value }))} /></label>
      {draft.sessions.map((session, sessionIndex) => <fieldset className={s.sessionEdit} key={sessionIndex}><legend>Session {sessionIndex + 1}</legend><div className={s.fields}><label>Session name<input required maxLength={240} value={session.name} onChange={e => updateSession(sessionIndex, { name: e.target.value })} /></label><label>Estimated minutes<input required type="number" min="1" max="1440" step="1" value={session.minutes} onChange={e => updateSession(sessionIndex, { minutes: e.target.value })} /></label></div>
        {session.exercises.map((exercise, index) => { const alternative = exerciseAlternative(program.sessions.flatMap(value => value.exercises).find(value => value.name === exercise.name) ?? exercise); return <div key={index}><div className={s.exerciseEdit}><label>Movement {index + 1}<input required maxLength={240} value={exercise.name} onChange={e => updateSession(sessionIndex, { exercises: session.exercises.map((value, i) => i === index ? { ...value, name: e.target.value } : value) })} /></label><label>Sets × reps / duration<input required maxLength={240} value={exercise.dose} onChange={e => updateSession(sessionIndex, { exercises: session.exercises.map((value, i) => i === index ? { ...value, dose: e.target.value } : value) })} /></label><button type="button" className={ui.iconButton} aria-label={`Remove movement ${index + 1} from ${session.name}`} disabled={session.exercises.length === 1} onClick={() => updateSession(sessionIndex, { exercises: session.exercises.filter((_, i) => i !== index) })}><FiTrash2 /></button></div>{alternative && alternative !== exercise.name && <button type="button" className={ui.textButton} onClick={() => updateSession(sessionIndex, { exercises: session.exercises.map((value, i) => i === index ? { ...value, name: alternative } : value) })}>Try instead: {alternative}</button>}</div>; })}
        <div className={s.actions}><button type="button" className={ui.secondary} disabled={session.exercises.length >= 30} onClick={() => updateSession(sessionIndex, { exercises: [...session.exercises, { name: "", dose: "" }] })}><FiPlus />Add movement</button><button type="button" className={ui.textButton} disabled={draft.sessions.length === 1} onClick={() => setDraft(current => ({ ...current, sessions: current.sessions.filter((_, i) => i !== sessionIndex) }))}>Remove session</button></div>
      </fieldset>)}
      <button type="button" className={ui.secondary} disabled={draft.sessions.length >= 30} onClick={() => setDraft(current => ({ ...current, sessions: [...current.sessions, { name: "", minutes: "20", exercises: [{ name: "", dose: "" }] }] }))}><FiPlus />Add session</button>
      {conflict && <p className={s.error} role="alert">This plan changed or was removed elsewhere. Close this editor and reopen the latest plan before saving.</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><button type="submit" className={ui.primary} disabled={saving || pending || conflict}><FiCheck />{pending ? "Saving…" : item ? "Save changes" : "Save my plan"}</button><button type="button" className={ui.secondary} onClick={close}>Cancel</button></div>
    </form>
  </dialog>;
}

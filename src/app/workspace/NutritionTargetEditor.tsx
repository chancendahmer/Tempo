"use client";
import { useEffect, useRef, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { lifeItemSchema, type LifeItem, type SavedLifeItem } from "../../server/domain/life-items";
import { nutrientKeys } from "./nutrition-model";
import { loopDialogTab } from "./dialog-keyboard";
import ui from "./workspace.module.css";
import s from "./food-fitness.module.css";

export type NutritionTarget = Extract<LifeItem, { kind: "nutrition_target" }>;
export function buildNutritionTarget(values: Record<typeof nutrientKeys[number], string>): NutritionTarget {
  const nutrients = Object.fromEntries(nutrientKeys.map(key => [key, values[key].trim() ? Number(values[key]) : null]));
  const result = lifeItemSchema.safeParse({ kind: "nutrition_target", title: "Daily nutrition targets", ...nutrients });
  if (!result.success) throw new Error("Use values from 0 to 10,000, or leave a target blank.");
  return result.data as NutritionTarget;
}
export function NutritionTargetEditor({ item, latestItem, saving, save, close }: { item?: SavedLifeItem; latestItem?: SavedLifeItem; saving: boolean; save: (data: LifeItem, item?: SavedLifeItem) => Promise<boolean>; close: () => void }) {
  const original = item?.data.kind === "nutrition_target" ? item.data : undefined;
  const [values, setValues] = useState(() => Object.fromEntries(nutrientKeys.map(key => [key, original?.[key]?.toString() ?? ""])) as Record<typeof nutrientKeys[number], string>);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const conflict = !!item && (!latestItem || item.version !== latestItem.version);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`${ui.dialog} ${s.dialog}`} onCancel={close} onKeyDown={loopDialogTab} aria-label="Daily nutrition targets"><div className={ui.between}><div><p className={ui.eyebrow}>OPTIONAL, AND UP TO YOU</p><h2>Your daily targets</h2></div><button className={ui.iconButton} onClick={close} aria-label="Close daily targets"><FiX /></button></div><form className={s.form} onSubmit={async e => { e.preventDefault(); if (saving || submitting.current || conflict) return; setError(""); try { const value = buildNutritionTarget(values); submitting.current = true; setPending(true); if (await save(value, item)) close(); else setError("Targets weren’t saved. Close and reopen this editor to use the latest values, then try again."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save targets."); } finally { submitting.current = false; setPending(false); } }}><p className={s.info}>Use targets you have chosen for yourself. Leave any field blank to hide that target. Tempo does not calculate your calorie or nutrition needs.</p><div className={s.fields}>{nutrientKeys.map(key => <label key={key}>{key === "calories" ? "Calories (kcal)" : `${key[0].toUpperCase()}${key.slice(1)} (g)`}<input type="number" min="0" max="10000" step="any" placeholder="No target" value={values[key]} onChange={e => setValues(current => ({ ...current, [key]: e.target.value }))} /></label>)}</div>{conflict && <p className={s.error} role="alert">These targets changed elsewhere. Close and reopen the editor before saving.</p>}{error && <p className={s.error} role="alert">{error}</p>}<div className={s.actions}><button className={ui.primary} type="submit" disabled={saving || pending || conflict}><FiCheck />{pending ? "Saving…" : "Save targets"}</button><button className={ui.secondary} type="button" onClick={() => setValues({ calories: "", protein: "", carbs: "", fat: "", fiber: "" })}>Clear fields</button></div></form></dialog>;
}

"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { FiCheck, FiChevronDown, FiX } from "react-icons/fi";
import { lifeItemSchema, type LifeItem, type SavedLifeItem } from "../../server/domain/life-items";
import { meals, nutrientKeys, type FoodEntry } from "./nutrition-model";
import { loopDialogTab } from "./dialog-keyboard";
import ui from "./workspace.module.css";
import s from "./food-fitness.module.css";

const additionalNutrients = nutrientKeys.filter(key => key !== "calories");

export type FoodDraft = { title: string; date: string; meal: FoodEntry["meal"]; amount: string; unit: "g" | "ml"; favorite: boolean; calories: string; protein: string; carbs: string; fat: string; fiber: string };
export function buildFoodEntry(draft: FoodDraft, original?: FoodEntry): FoodEntry {
  if (!draft.title.trim()) throw new Error("Give this food a name.");
  const nutrients = Object.fromEntries(nutrientKeys.map(key => {
    const value = draft[key].trim() === "" ? null : Number(draft[key]);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 10000)) throw new Error(`Choose a ${key} value from 0 to 10,000, or leave it blank.`);
    return [key, value];
  }));
  const parsed = lifeItemSchema.safeParse({ ...original, ...draft, ...nutrients, kind: "food", amount: draft.amount.trim() ? Number(draft.amount) : undefined, unit: draft.amount.trim() ? draft.unit : undefined, source: original?.source ?? "manual" });
  if (!parsed.success) throw new Error("Check the date and portion. Use an amount above 0 and at most 10,000.");
  return parsed.data as FoodEntry;
}

export function FoodEntryEditor({ date, meal = "Breakfast", item, latestItem, saving, save, close }: {
  date: string; meal?: FoodEntry["meal"]; item?: SavedLifeItem; latestItem?: SavedLifeItem; saving: boolean;
  save: (data: LifeItem, item?: SavedLifeItem) => Promise<boolean>; close: () => void;
}) {
  const original = item?.data.kind === "food" ? item.data : undefined;
  const [draft, setDraft] = useState<FoodDraft>(() => ({ title: original?.title ?? "", date: original?.date ?? date, meal: original?.meal ?? meal, amount: original?.amount?.toString() ?? "", unit: original?.unit ?? "g", favorite: original?.favorite ?? false, ...Object.fromEntries(nutrientKeys.map(key => [key, original?.[key]?.toString() ?? ""])) } as FoodDraft));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [nutrientsOpen, setNutrientsOpen] = useState(() => additionalNutrients.some(key => original?.[key] != null));
  const nutrientsId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const conflict = !!item && (!latestItem || item.version !== latestItem.version);
  useEffect(() => {
    const current = dialog.current;
    if (!current) return;
    const root = document.documentElement;
    const opener = document.activeElement;
    const previousOverflow = root.style.overflow;
    const viewport = window.visualViewport;
    const fitViewport = () => {
      if (!viewport) return;
      current.style.setProperty("--food-viewport-height", `${viewport.height}px`);
      const bottom = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      current.style.setProperty("--food-viewport-bottom", `${bottom}px`);
    };

    root.style.overflow = "hidden";
    fitViewport();
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    current.showModal();
    if (!window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-height: 500px)").matches) {
      nameInput.current?.focus({ preventScroll: true });
    }

    return () => {
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
      root.style.overflow = previousOverflow;
      current.close();
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, []);
  function update<K extends keyof FoodDraft>(key: K, value: FoodDraft[K]) { setDraft(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || saving || conflict) return;
    setError("");
    try {
      const date = String(new FormData(event.currentTarget).get("date") ?? "");
      const value = buildFoodEntry({ ...draft, date }, original);
      submitting.current = true;
      setPending(true);
      if (await save(value, item)) close();
      else setError("The entry wasn’t saved. Check the workspace message and try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this food.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return <dialog ref={dialog} className={`${ui.dialog} ${s.dialog} ${s.foodEditor}`} onKeyDown={loopDialogTab} onCancel={close} aria-label={item ? "Edit food entry" : "Add food manually"}>
    <div className={`${ui.between} ${s.foodHeading}`}><div><p className={ui.eyebrow}>YOUR FOOD DIARY</p><h2>{item ? "Edit your food entry" : "Add your own food"}</h2></div><button className={ui.iconButton} onClick={close} aria-label="Close food editor"><FiX /></button></div>
    <form className={s.form} onSubmit={submit}>
      <div className={s.foodBody}>
        <p className={s.info}><span className={s.desktopFoodInfo}>Enter the label values for the entire portion you ate. Leave unknown nutrients blank. Changing the portion amount here does not recalculate your entered values.</span><span className={s.mobileFoodInfo}>Use values for the whole portion you ate. Leave unknowns blank. Portion edits don’t recalculate nutrients.</span></p>
        <div className={s.fields}>
          <label className={s.wide}>Food name<input ref={nameInput} required maxLength={240} value={draft.title} onChange={e => update("title", e.target.value)} /></label>
          <label>Date<input name="date" required type="date" defaultValue={draft.date} /></label>
          <label>Meal<select value={draft.meal} onChange={e => update("meal", e.target.value as FoodEntry["meal"])}>{meals.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Portion amount (optional)<input type="number" min="0.1" max="10000" step="0.1" inputMode="decimal" value={draft.amount} onChange={e => update("amount", e.target.value)} /></label>
          <label>Portion unit<select value={draft.unit} onChange={e => update("unit", e.target.value as "g" | "ml")}><option value="g">grams</option><option value="ml">millilitres</option></select></label>
          <label>Calories (kcal)<input type="number" min="0" max="10000" step="any" inputMode="decimal" placeholder="Unknown" value={draft.calories} onChange={e => update("calories", e.target.value)} /></label>
          <button className={s.nutrientToggle} type="button" aria-expanded={nutrientsOpen} aria-controls={nutrientsId} onClick={() => setNutrientsOpen(open => !open)}>More nutrients <FiChevronDown aria-hidden="true" /></button>
          <div id={nutrientsId} className={s.additionalNutrients} onInvalidCapture={() => {
            // Reveal a collapsed invalid field before native validation tries to focus it.
            if (!nutrientsOpen) flushSync(() => setNutrientsOpen(true));
          }}>
            {additionalNutrients.map(key => <label key={key}>{`${key[0].toUpperCase()}${key.slice(1)} (g)`}<input type="number" min="0" max="10000" step="any" inputMode="decimal" placeholder="Unknown" value={draft[key]} onChange={e => update(key, e.target.value)} /></label>)}
          </div>
        </div>
        <label className={s.checkLabel}><input type="checkbox" checked={draft.favorite} onChange={e => update("favorite", e.target.checked)} />Keep in favorite foods</label>
      </div>
      <div className={s.foodFooter}>
        {conflict && <p role="alert" className={s.error}>This entry changed or was removed elsewhere. Close this editor and reopen the latest entry before saving.</p>}
        {error && <p role="alert" className={s.error}>{error}</p>}
        <div className={s.actions}><button type="submit" className={ui.primary} disabled={saving || pending || conflict}><FiCheck aria-hidden="true" />{pending ? "Saving…" : "Save food"}</button><button type="button" className={ui.secondary} onClick={close}>Cancel</button></div>
      </div>
    </form>
  </dialog>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { FiCoffee, FiCopy, FiEdit2, FiHeart, FiPlus, FiStar, FiTrash2, FiX } from "react-icons/fi";
import type { LifeItem, SavedLifeItem } from "../../server/domain/life-items";
import { FoodEntryEditor } from "./FoodEntryEditor";
import { FoodSearch } from "./FoodSearch";
import { NutritionTargetEditor } from "./NutritionTargetEditor";
import { isFood, meals, nutrientKeys, nutrientLabel, nutritionTotals, repeatFood, type FoodEntry, type SavedFood } from "./nutrition-model";
import { loopDialogTab } from "./dialog-keyboard";
import ui from "./workspace.module.css";
import s from "./food-fitness.module.css";

type Props = { items: SavedLifeItem[]; date: string; today: string; setDate: (date: string) => void; saving: boolean; preview: boolean; save: (data: LifeItem, item?: SavedLifeItem) => Promise<boolean>; remove: (item: SavedLifeItem) => void };
export function NutritionView({ items, date, today, setDate, saving, preview, save, remove }: Props) {
  const [search, setSearch] = useState(false);
  const [editor, setEditor] = useState<{ item?: SavedLifeItem; meal?: FoodEntry["meal"] } | null>(null);
  const [copy, setCopy] = useState<SavedFood | null>(null);
  const [targetEditor, setTargetEditor] = useState<{ item?: SavedLifeItem } | null>(null);
  const targetItem = items.find(item => item.data.kind === "nutrition_target");
  const targets = targetItem?.data.kind === "nutrition_target" ? targetItem.data : undefined;
  const foods = items.filter(isFood).filter(item => item.data.date === date);
  const totals = nutritionTotals(foods);
  return <>
    <div className={s.toolbar}><div className={s.actions}><input className={ui.dateInput} aria-label="Food log date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /><button className={ui.textButton} onClick={() => setDate(today)}>Today</button><button className={ui.textButton} onClick={() => setTargetEditor({ item: targetItem })}>Daily targets</button></div><div className={s.actions}><button className={ui.secondary} onClick={() => setEditor({})}><FiPlus />Manual entry</button><button className={ui.primary} onClick={() => setSearch(true)}><FiPlus />Find a food / scan</button></div></div>
    <div className={ui.nutritionSummary}>
      <article className={`${ui.card} ${ui.calorieCard}`}><div className={ui.calorieCircle}><FiHeart /><strong>{nutrientLabel(totals.calories.value)}</strong><span>kcal logged</span></div><div><p className={ui.eyebrow}>LOGGED FOR THIS DAY</p><h2>Logged, not judged.</h2><small>{preview ? "Illustrative sample estimates · not measured intake" : "Your food diary"}</small>{targets?.calories != null && <small>Your daily target: {nutrientLabel(targets.calories)} kcal</small>}{totals.calories.missing > 0 && <small>{totals.calories.missing} {totals.calories.missing === 1 ? "entry has" : "entries have"} unknown calories</small>}<details className={ui.inlineDetails}><summary>About these totals</summary><p>Known values are added together. “—” means no known value; partial totals exclude missing data. Check database portions against the package.</p></details></div></article>
      <article className={ui.card}><h3>Nutrients logged</h3>{nutrientKeys.filter(key => key !== "calories").map((key, i) => <div className={ui.nutrient} key={key}><span><i className={[ui.sage, ui.amber, ui.lavender, ui.rose][i]} />{key[0].toUpperCase() + key.slice(1)}{totals[key].missing > 0 && <small>{totals[key].missing} unknown</small>}</span><div><strong>{nutrientLabel(totals[key].value)} g</strong>{targets?.[key] != null && <small>Target {nutrientLabel(targets[key])} g</small>}</div></div>)}</article>
    </div>
    <article className={ui.card}><div className={s.toolbar}><h2>Your food diary</h2><small>{foods.length} {foods.length === 1 ? "entry" : "entries"}</small></div>{meals.map(meal => <div className={ui.diaryMeal} key={meal}><div className={s.toolbar}><p className={ui.eyebrow}><span className={ui.mealDot} />{meal}</p><button className={ui.textButton} onClick={() => setEditor({ meal })} aria-label={`Add food to ${meal.toLowerCase()}`}><FiPlus />Add food</button></div>{foods.filter(item => item.data.meal === meal).map(item => <div className={s.entry} key={item.id}><FiCoffee /><div className={s.entryMain}><strong>{item.data.title}</strong><small>{item.data.amount ? `${nutrientLabel(item.data.amount)} ${item.data.unit ?? "g"} · ` : ""}{nutrientLabel(item.data.calories)} kcal · {nutrientLabel(item.data.protein)} g protein · {nutrientLabel(item.data.carbs)} g carbs · {nutrientLabel(item.data.fat)} g fat</small></div><div className={s.actions}><button className={`${ui.iconButton} ${s.favorite}`} aria-label={`${item.data.favorite ? "Unfavorite" : "Favorite"} ${item.data.title}`} aria-pressed={!!item.data.favorite} disabled={saving} onClick={() => void save({ ...item.data, favorite: !item.data.favorite }, item)}><FiStar /></button><button className={ui.iconButton} aria-label={`Copy ${item.data.title}`} disabled={saving} onClick={() => setCopy(item)}><FiCopy /></button><button className={ui.iconButton} aria-label={`Edit ${item.data.title}`} onClick={() => setEditor({ item })}><FiEdit2 /></button><button className={ui.iconButton} aria-label={`Delete ${item.data.title}`} disabled={saving} onClick={() => remove(item)}><FiTrash2 /></button></div></div>)}{!foods.some(item => item.data.meal === meal) && <small>Nothing logged yet.</small>}</div>)}</article>
    {foods.some(item => item.data.source === "openfoodfacts") && <div className={ui.foodAttribution}><span>Includes data from <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>. Check values against the package.</span></div>}
    {search && <FoodSearch date={date} preview={preview} recent={items} onSave={save} onClose={() => setSearch(false)} onManual={() => setEditor({})} />}
    {editor && <FoodEntryEditor date={date} meal={editor.meal} item={editor.item} latestItem={items.find(item => item.id === editor.item?.id)} saving={saving} save={save} close={() => setEditor(null)} />}
    {copy && <CopyFood item={copy} date={date} saving={saving} save={save} close={() => setCopy(null)} />}
    {targetEditor && <NutritionTargetEditor item={targetEditor.item} latestItem={items.find(item => item.id === targetEditor.item?.id)} saving={saving} save={save} close={() => setTargetEditor(null)} />}
  </>;
}

function CopyFood({ item, date, saving, save, close }: { item: SavedFood; date: string; saving: boolean; save: Props["save"]; close: () => void }) {
  const [targetDate, setDate] = useState(date);
  const [meal, setMeal] = useState(item.data.meal);
  const [multiplier, setMultiplier] = useState("1");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`${ui.dialog} ${s.dialog}`} onCancel={close} onKeyDown={loopDialogTab} aria-label="Copy food entry"><div className={ui.between}><h2>Have it again</h2><button className={ui.iconButton} onClick={close} aria-label="Close copy food"><FiX /></button></div><form className={s.form} onSubmit={async e => { e.preventDefault(); if (saving || submitting.current) return; setError(""); try { const value = repeatFood(item.data, targetDate, meal, Number(multiplier)); submitting.current = true; setPending(true); if (await save(value)) close(); else setError("Could not copy this entry. Please try again."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the portion."); } finally { setPending(false); submitting.current = false; } }}><p>{item.data.title}</p><div className={s.fields}><label>Date<input required type="date" value={targetDate} onChange={e => setDate(e.target.value)} /></label><label>Meal<select value={meal} onChange={e => setMeal(e.target.value as FoodEntry["meal"])}>{meals.map(value => <option key={value}>{value}</option>)}</select></label><label>Portion multiplier<input required type="number" min="0.01" max="100" step="0.01" value={multiplier} onChange={e => setMultiplier(e.target.value)} /></label></div><small>1 keeps the same portion, 0.5 halves it, and 2 doubles it. Nutrients and the recorded amount scale together.</small>{error && <p className={s.error} role="alert">{error}</p>}<button className={ui.primary} disabled={saving || pending} type="submit"><FiCopy />{pending ? "Copying…" : "Copy to diary"}</button></form></dialog>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiCoffee, FiCopy, FiEdit2, FiPlus, FiStar, FiTrash2, FiX } from "react-icons/fi";
import type { LifeItem, SavedLifeItem } from "../../server/domain/life-items";
import { FoodEntryEditor } from "./FoodEntryEditor";
import { FoodSearch } from "./FoodSearch";
import { NutritionTargetEditor } from "./NutritionTargetEditor";
import { isFood, meals, nutrientLabel, nutritionTotals, repeatFood, type FoodEntry, type SavedFood } from "./nutrition-model";
import { loopDialogTab } from "./dialog-keyboard";
import ui from "./workspace.module.css";
import s from "./food-fitness.module.css";
import n from "./nutrition.module.css";

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
  const weekStart = new Date(`${date}T12:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(weekStart); day.setUTCDate(day.getUTCDate() + index); return { value: day.toISOString().slice(0, 10), label: day.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }), number: day.getUTCDate() }; });
  const shiftWeek = (offset: number) => { const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + offset); setDate(day.toISOString().slice(0, 10)); };
  const calorieTarget = targets?.calories;
  const calorieValue = totals.calories.value;
  const remaining = calorieTarget != null && calorieValue != null && !totals.calories.missing ? calorieTarget - calorieValue : null;
  return <div className={n.tracker}>
    <div className={n.topbar}><div className={s.actions}><input className={ui.dateInput} aria-label="Nutrition tracker date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /><button className={ui.textButton} onClick={() => setDate(today)}>Today</button></div><div className={s.actions}><button className={ui.textButton} onClick={() => setTargetEditor({ item: targetItem })}>Daily targets</button><button className={ui.secondary} onClick={() => setEditor({})}><FiPlus />Manual entry</button><button className={ui.primary} onClick={() => setSearch(true)}><FiPlus />Find a food / scan</button></div></div>
    <div className={n.week}><button className={ui.iconButton} aria-label="Previous nutrition week" onClick={() => shiftWeek(-7)}><FiChevronLeft /></button><div className={n.days} role="group" aria-label="Nutrition diary week">{days.map(day => <button key={day.value} aria-pressed={date === day.value} aria-label={`${day.label} ${day.value}${day.value === today ? ", today" : ""}`} onClick={() => setDate(day.value)}><span>{day.label}</span><strong>{day.number}</strong>{day.value === today && <small>Today</small>}</button>)}</div><button className={ui.iconButton} aria-label="Next nutrition week" onClick={() => shiftWeek(7)}><FiChevronRight /></button></div>
    <div className={n.summary}>
      <article className={n.calories}><div className={n.summaryLine}><div><p className={n.label}>Calories</p><p className={n.calorieValue}><strong>{nutrientLabel(calorieValue)}</strong><span> kcal logged{calorieTarget != null ? ` / ${nutrientLabel(calorieTarget)} target` : ""}</span></p></div><span className={n.remaining}>{remaining != null ? `${nutrientLabel(Math.abs(remaining))} kcal ${remaining < 0 ? "over target" : "remaining"}` : calorieTarget == null ? "No daily target" : "Remaining unknown"}</span></div><NutrientBar label="Calories" value={calorieValue} target={calorieTarget} />{totals.calories.missing > 0 && <p className={n.partial}>{totals.calories.missing} {totals.calories.missing === 1 ? "entry has" : "entries have"} unknown calories · partial total</p>}<div className={n.summaryFoot}><small>{preview ? "Illustrative sample estimates · not measured intake" : "Your food diary"}</small><details><summary>About these totals</summary><p>Known values are added together. “—” means no known value; partial totals exclude missing data. Targets are optional and chosen by you. Check database portions against the package.</p></details></div></article>
      <div className={n.macros}>{(["carbs", "fat", "protein"] as const).map(key => <article key={key} className={`${n.macro} ${n[key]}`}><p className={n.label}>{key[0].toUpperCase() + key.slice(1)}</p><p><strong>{nutrientLabel(totals[key].value)} g</strong>{targets?.[key] != null && <span> / {nutrientLabel(targets[key])} g</span>}</p><NutrientBar label={key} value={totals[key].value} target={targets?.[key]} /><small>{totals[key].missing ? `${totals[key].missing} unknown · partial total` : targets?.[key] == null ? "No daily target" : "Your daily target"}</small></article>)}</div>
    </div>
    <div className={n.diaryHeading}><div><h2>Your food diary</h2><span>{foods.length} {foods.length === 1 ? "entry" : "entries"} · logged, not judged</span></div><p>Fiber <strong>{nutrientLabel(totals.fiber.value)} g</strong>{targets?.fiber != null && ` / ${nutrientLabel(targets.fiber)} g target`}{totals.fiber.missing > 0 && ` · ${totals.fiber.missing} unknown`}</p></div>
    <div className={n.diary}>{meals.map(meal => { const mealFoods = foods.filter(item => item.data.meal === meal); const mealCalories = nutritionTotals(mealFoods).calories; return <article className={n.meal} key={meal}><div className={n.mealHeading}><span className={n.mealIcon}><FiCoffee /></span><div><h3>{meal}</h3><small>{mealFoods.length ? `${nutrientLabel(mealCalories.value)} kcal${mealCalories.missing ? " · partial" : ""}` : "Ready when you are"}</small></div><button className={n.logButton} onClick={() => setEditor({ meal })} aria-label={`Add food to ${meal.toLowerCase()}`}><FiPlus />Log food</button></div>{mealFoods.map(item => <div className={n.entry} key={item.id}><div className={s.entryMain}><strong>{item.data.title}</strong><small>{item.data.amount ? `${nutrientLabel(item.data.amount)} ${item.data.unit ?? "g"} · ` : ""}{nutrientLabel(item.data.calories)} kcal · {nutrientLabel(item.data.protein)} g protein · {nutrientLabel(item.data.carbs)} g carbs · {nutrientLabel(item.data.fat)} g fat</small></div><div className={n.entryActions}><button className={`${ui.iconButton} ${s.favorite}`} aria-label={`${item.data.favorite ? "Unfavorite" : "Favorite"} ${item.data.title}`} aria-pressed={!!item.data.favorite} disabled={saving} onClick={() => void save({ ...item.data, favorite: !item.data.favorite }, item)}><FiStar /></button><button className={ui.iconButton} aria-label={`Copy ${item.data.title}`} disabled={saving} onClick={() => setCopy(item)}><FiCopy /></button><button className={ui.iconButton} aria-label={`Edit ${item.data.title}`} onClick={() => setEditor({ item })}><FiEdit2 /></button><button className={ui.iconButton} aria-label={`Delete ${item.data.title}`} disabled={saving} onClick={() => remove(item)}><FiTrash2 /></button></div></div>)}{!mealFoods.length && <p className={n.emptyMeal}>Nothing logged yet.</p>}</article>; })}</div>
    {foods.some(item => item.data.source === "openfoodfacts") && <div className={ui.foodAttribution}><span>Includes data from <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>. Check values against the package.</span></div>}
    {search && <FoodSearch date={date} preview={preview} recent={items} onSave={save} onClose={() => setSearch(false)} onManual={() => setEditor({})} />}
    {editor && <FoodEntryEditor date={date} meal={editor.meal} item={editor.item} latestItem={items.find(item => item.id === editor.item?.id)} saving={saving} save={save} close={() => setEditor(null)} />}
    {copy && <CopyFood item={copy} date={date} saving={saving} save={save} close={() => setCopy(null)} />}
    {targetEditor && <NutritionTargetEditor item={targetEditor.item} latestItem={items.find(item => item.id === targetEditor.item?.id)} saving={saving} save={save} close={() => setTargetEditor(null)} />}
  </div>;
}

function NutrientBar({ label, value, target }: { label: string; value: number | null; target?: number | null }) {
  return value != null && target != null && target > 0 ? <progress className={n.bar} aria-label={`${label}: ${nutrientLabel(value)} of ${nutrientLabel(target)} target`} value={Math.min(value, target)} max={target} /> : <div className={n.emptyBar} aria-hidden="true" />;
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

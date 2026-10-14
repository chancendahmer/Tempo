"use client";
import type { ReactNode } from "react";
import { FiArrowRight, FiCheck, FiHeart, FiPlus, FiShoppingBag } from "react-icons/fi";
import type { LifeItem, SavedLifeItem } from "@/server/domain/life-items";
import { MealPhoto } from "./MealPhoto";
import { MealIllustration } from "./SectionArt";
import { recipePhotoFor } from "./demo-recipes";
import s from "./workspace.module.css";

type Props = { tab: string; items: SavedLifeItem[]; date: string; today: string; setDate: (date: string) => void; saving: boolean;
  edit: (kind: LifeItem["kind"], item?: SavedLifeItem, meal?: string) => void;
  plan: (item: SavedLifeItem) => void; actions: (item: SavedLifeItem) => ReactNode;
  save: (data: LifeItem, item: SavedLifeItem) => Promise<boolean>; ask: (text: string) => void;
};
export function FoodViews({ tab, items, date, today, setDate, saving, edit, plan, actions, save, ask }: Props) {
  const recipes = items.filter(item => item.data.kind === "recipe");
  if (tab === "recipes") return <>
    <div className={s.sectionHeading}><h2>Meals worth remembering</h2><button className={s.secondary} onClick={() => edit("recipe")}><FiPlus /> Save a recipe</button></div>
    <div className={s.recipeGrid}>{recipes.map(item => <article className={`${s.card} ${s.recipeCard}`} key={item.id}>
      <MealPhoto data={item.data} />
      <div className={s.between}><span className={`${s.tileIcon} ${s.rose}`}><FiHeart /></span>{actions(item)}</div><h3>{item.data.title}</h3>
      {item.data.kind === "recipe" && <><small>{item.data.prepMinutes} min preparation · {item.data.servings} {item.data.servings === 1 ? "serving" : "servings"}</small><details><summary>Ingredients & preparation</summary><p className={s.prewrap}>{item.data.ingredients}</p><p className={s.prewrap}>{item.data.instructions}</p></details><button className={s.textButton} disabled={saving} onClick={() => plan(item)}>Plan a meal <FiArrowRight /></button></>}
    </article>)}</div>
    {!recipes.length && <div className={s.infoStrip}><FiHeart /><span>Keep a favorite recipe here.</span><button className={s.textButton} onClick={() => ask("Save a favorite recipe for me: ")}>Tell Tempo <FiArrowRight /></button></div>}
  </>;
  if (tab === "groceries") return <article className={s.card}>
    <div className={s.sectionHeading}><h2><FiShoppingBag /> Shopping list</h2><button className={s.secondary} onClick={() => edit("grocery")}><FiPlus /> Add grocery</button></div>
    {items.filter(item => item.data.kind === "grocery").map(item => <div className={s.taskRow} key={item.id}><button className={`${s.check} ${item.data.kind === "grocery" && item.data.checked ? s.checked : ""}`} disabled={saving} aria-label={`Toggle ${item.data.title}`} aria-pressed={item.data.kind === "grocery" && item.data.checked} onClick={() => { if (item.data.kind === "grocery") void save({ ...item.data, checked: !item.data.checked }, item); }}>{item.data.kind === "grocery" && item.data.checked && <FiCheck />}</button><span className={s.grow}>{item.data.title}</span>{actions(item)}</div>)}
    {!items.some(item => item.data.kind === "grocery") && <p className={s.muted}>Your list is clear. Add what you need for your next shop.</p>}
  </article>;
  const days = Array.from({ length: 7 }, (_, offset) => { const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + offset); return { date: day.toISOString().slice(0, 10), label: offset === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }), number: day.getUTCDate() }; });
  return <>
    <div className={s.sectionHeading}><div className={s.row}><h2>On the menu</h2><input className={s.dateInput} aria-label="Meal plan date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></div><button className={s.primary} onClick={() => edit("meal")}><FiPlus /> Plan a meal</button></div>
    <div className={s.weekStrip} aria-label="Meal plan week">{days.map(day => <button key={day.date} aria-pressed={day.date === date} onClick={() => setDate(day.date)}><span>{day.label}</span><strong>{day.number}</strong><i /></button>)}</div>
    <div className={s.mealGrid}>{["Breakfast", "Lunch", "Dinner", "Snack"].map((meal, index) => {
      const meals = items.filter(item => item.data.kind === "meal" && item.data.date === date && item.data.meal === meal);
      return <article className={s.card} key={meal}>
        {!meals.some(item => recipePhotoFor(item.data)) && <div className={`${s.mealArt} ${[s.amber, s.sage, s.lavender, s.rose][index]}`}><MealIllustration meal={meal} /></div>}
        <p className={s.eyebrow}>{meal}</p>
        {meals.map(item => <div key={item.id}><MealPhoto data={item.data} /><h3>{item.data.title}</h3>{item.data.kind === "meal" && <>{item.data.servings && <small>Preparing {item.data.servings} {item.data.servings === 1 ? "serving" : "servings"}</small>}{item.data.ingredients && <details className={s.inlineDetails}><summary>Ingredients</summary><p className={s.prewrap}>{item.data.ingredients}</p></details>}</>}{actions(item)}</div>)}
        {!meals.length && <p className={s.muted}>Nothing planned. There’s room to decide later.</p>}
        <button className={s.textButton} onClick={() => edit("meal", undefined, meal)}><FiPlus /> Add a meal</button>
      </article>;
    })}</div>
  </>;
}

"use client";
import type { ReactNode } from "react";
import { FiArrowRight, FiCheck, FiHeart, FiPlus, FiShoppingBag } from "react-icons/fi";
import type { LifeItem, SavedLifeItem } from "@/server/domain/life-items";
import { MealPhoto } from "./MealPhoto";
import { MealIllustration } from "./SectionArt";
import { demoRecipes, savedDemoRecipe, recipePhotoFor } from "./demo-recipes";
import { ingredientLabel } from "../../server/domain/meal-groceries";
import s from "./workspace.module.css";

type Props = { tab: string; items: SavedLifeItem[]; date: string; today: string; setDate: (date: string) => void; saving: boolean;
  edit: (kind: LifeItem["kind"], item?: SavedLifeItem, meal?: string) => void;
  plan: (item: SavedLifeItem) => void; actions: (item: SavedLifeItem) => ReactNode;
  save: (data: LifeItem, item?: SavedLifeItem, sourceRecipeId?: string) => Promise<boolean>; ask: (text: string) => void;
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
    <details className={s.card} open={!recipes.length}><summary>Find a new favorite · recipe ideas</summary><p>Choose a recipe to save to your library. Photos are illustrations of the prepared dishes; portions and ingredients are listed below.</p><div className={s.recipeGrid}>{demoRecipes.map(recipe => <article key={recipe.title} className={s.card}><MealPhoto data={recipe} /><h3>{recipe.title}</h3><small>{recipe.prepMinutes} min · {recipe.servings} servings</small><details><summary>Ingredients & preparation</summary><p className={s.prewrap}>{recipe.ingredients}</p><p className={s.prewrap}>{recipe.instructions}</p></details><button className={s.secondary} disabled={saving || recipes.some(item => item.data.title === recipe.title)} onClick={() => void save(savedDemoRecipe(recipe))}>{recipes.some(item => item.data.title === recipe.title) ? "Saved in your library" : "Save recipe"}</button></article>)}</div></details>
  </>;
  if (tab === "groceries") return <><article className={s.card}>
    <div className={s.sectionHeading}><h2><FiShoppingBag /> Shopping list</h2><button className={s.secondary} onClick={() => edit("grocery")}><FiPlus /> Add grocery</button></div>
    <p className={s.muted}>Check off what you bought. Add it to pantry separately when it’s stocked.</p>
    {items.filter(item => item.data.kind === "grocery").sort((a, b) => Number(a.data.kind === "grocery" && a.data.checked) - Number(b.data.kind === "grocery" && b.data.checked)).map(item => item.data.kind === "grocery" && <div className={s.taskRow} key={item.id}><button className={`${s.check} ${item.data.checked ? s.checked : ""}`} disabled={saving} aria-label={`${item.data.checked ? "Uncheck purchase" : "Mark purchased"}: ${item.data.title}`} aria-pressed={item.data.checked} onClick={() => { if (item.data.kind === "grocery") void save({ ...item.data, checked: !item.data.checked }, item); }}>{item.data.checked && <FiCheck />}</button><span className={s.grow}><strong>{ingredientLabel(item.data)}</strong><small>{item.data.checked ? "Purchased · not added to pantry" : item.data.mealSources?.length ? "From your meal plans" : "Added by you"}</small>{item.data.mealSources?.map(source => { const meal = items.find(row => row.id === source.mealId); return meal?.data.kind === "meal" ? <button className={s.textButton} key={source.mealId} onClick={() => edit("meal", meal)}>{meal.data.title} · {meal.data.date}</button> : null; })}</span>{!item.data.mealSources?.length && actions(item)}</div>)}
    {!items.some(item => item.data.kind === "grocery") && <p className={s.muted}>Your list is clear. Add what you need for your next shop.</p>}
    <details><summary>How shopping stays up to date</summary><p>Meal ingredients are combined only when names and units match. Changing servings adjusts quantities; removing a plan removes its share. Your manual entries stay separate. Past meals leave the shopping calculation after their local date. Only recorded pantry amounts are deducted.</p><p>To change a meal ingredient, open its source meal above. You can also switch off shopping for that meal.</p></details>
  </article><article className={s.card}><div className={s.sectionHeading}><div><h2>In your pantry</h2><p className={s.muted}>What you’ve actually stocked, not what you’ve eaten.</p></div><button className={s.secondary} onClick={() => edit("pantry")}><FiPlus /> Add stock</button></div>{items.filter(item => item.data.kind === "pantry").map(item => item.data.kind === "pantry" && <div className={s.taskRow} key={item.id}><span className={s.grow}><strong>{ingredientLabel(item.data)}</strong>{item.data.quantity === undefined && <small>Amount unknown · not deducted from shopping</small>}</span>{actions(item)}</div>)}{!items.some(item => item.data.kind === "pantry") && <p>No stock recorded. Add an amount when you know what’s on hand.</p>}</article></>;
  const days = Array.from({ length: 7 }, (_, offset) => { const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + offset); return { date: day.toISOString().slice(0, 10), label: offset === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }), number: day.getUTCDate() }; });
  return <>
    <div className={s.sectionHeading}><div className={s.row}><h2>On the menu</h2><input className={s.dateInput} aria-label="Meal plan date" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></div><button className={s.primary} onClick={() => edit("meal")}><FiPlus /> Plan a meal</button></div>
    <div className={s.weekStrip} aria-label="Meal plan week">{days.map(day => <button key={day.date} aria-pressed={day.date === date} onClick={() => setDate(day.date)}><span>{day.label}</span><strong>{day.number}</strong><i /></button>)}</div>
    <div className={s.mealGrid}>{["Breakfast", "Lunch", "Dinner", "Snack"].map((meal, index) => {
      const meals = items.filter(item => item.data.kind === "meal" && item.data.date === date && item.data.meal === meal);
      return <article className={s.card} key={meal}>
        {!meals.some(item => recipePhotoFor(item.data)) && <div className={`${s.mealArt} ${[s.amber, s.sage, s.lavender, s.rose][index]}`}><MealIllustration meal={meal} /></div>}
        <p className={s.eyebrow}>{meal}</p>
        {meals.map(item => <div key={item.id}><MealPhoto data={item.data} /><h3>{item.data.title}</h3>{item.data.kind === "meal" && <>{item.data.servings && <small>Preparing {item.data.servings} {item.data.servings === 1 ? "serving" : "servings"}</small>}{item.data.ingredients && <details className={s.inlineDetails}><summary>Ingredients</summary><small>{item.data.ingredientServings || item.data.servings ? <>Listed for {item.data.ingredientServings ?? item.data.servings} servings. Shopping scales to your planned portions.</> : <>Original portion count unknown. Set servings to record what these quantities make.</>}</small><p className={s.prewrap}>{item.data.ingredients}</p></details>}<label className={s.taskRow}><input type="checkbox" checked={item.data.groceriesEnabled === true} disabled={saving} onChange={event => { if (item.data.kind === "meal") void save({ ...item.data, groceriesEnabled: event.target.checked }, item); }} />Include ingredients in shopping</label>{recipes.length > 0 && <label>Swap for a saved recipe<select aria-label={`Swap ${item.data.title}`} value="" disabled={saving} onChange={event => { const recipe = recipes.find(row => row.id === event.target.value); if (recipe?.data.kind === "recipe" && item.data.kind === "meal") void save({ ...item.data, title: recipe.data.title, ingredients: recipe.data.ingredients }, item, recipe.id); }}><option value="">Choose recipe…</option>{recipes.map(recipe => <option key={recipe.id} value={recipe.id} disabled={recipe.data.kind === "recipe" && recipe.data.ingredients.length > 4000}>{recipe.data.title}{recipe.data.kind === "recipe" && recipe.data.ingredients.length > 4000 ? " · shorten ingredient list first" : ""}</option>)}</select></label>}</>}{actions(item)}</div>)}
        {!meals.length && <p className={s.muted}>Nothing planned. There’s room to decide later.</p>}
        <button className={s.textButton} onClick={() => edit("meal", undefined, meal)}><FiPlus /> Add a meal</button>
      </article>;
    })}</div><p className={s.muted}>Planning a meal adds shopping ingredients when enabled. It doesn’t log food as eaten. Visit Nutrition after your meal to record it.</p>
  </>;
}

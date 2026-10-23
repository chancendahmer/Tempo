/** Independent saved-meal journey against the disposable local release account only. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { LifeItem, SavedLifeItem } from "../../src/server/domain/life-items";

const base = "http://localhost:3101";
const fixture = JSON.parse(execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "qa/customer-review-2026-10-15/seed-local-account.ts", base, "populated"], { encoding: "utf8" }));
const prefix = `Meal review ${randomUUID().slice(0, 8)}`;
const owned: string[] = [];
const evidence: string[] = [];
let cookie = "";
let cacheKey = "";
const endpoint = `${base}/api/account/workspace`;
async function board() { const response = await fetch(endpoint, { headers: { cookie } }); assert.equal(response.status, 200); const body = await response.json() as { items: SavedLifeItem[]; cacheKey: string }; assert.ok(body.cacheKey); cacheKey = body.cacheKey; return body; }
async function write(value: unknown) { if (!cacheKey) await board(); const response = await fetch(endpoint, { method: "POST", headers: { "x-tempo-account": cacheKey, cookie, origin: base, "Content-Type": "application/json" }, body: JSON.stringify(value) }); const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); }
async function create(data: LifeItem, sourceRecipeId?: string) { const id = randomUUID(); owned.push(id); await write({ action: "save", id, version: 0, data, ...(sourceRecipeId ? { sourceRecipeId } : {}) }); return id; }
async function item(id: string) { const value = (await board()).items.find(value => value.id === id); assert.ok(value, `Missing ${id}`); return value; }
async function save(value: SavedLifeItem, data: LifeItem) { await write({ action: "save", id: value.id, version: value.version, data }); }
async function shopping() { return (await board()).items.filter(value => value.data.kind === "grocery" && value.data.title.startsWith(prefix)); }

async function run() {
  const signin = await fetch(fixture.signInUrl, { method: "POST", headers: { origin: base }, body: new URLSearchParams({ token: new URL(fixture.signInUrl).searchParams.get("token")! }), redirect: "manual" });
  assert.ok([302, 303, 307].includes(signin.status));
  cookie = signin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookie);
  for (const leftover of (await board()).items.filter(value => value.data.title.startsWith("Meal review ") && !(value.data.kind === "grocery" && value.data.mealSources))) await write({ action: "delete", id: leftover.id, version: leftover.version });
  const recipeId = await create({ kind: "recipe", title: `${prefix} recipe`, ingredients: `200 g ${prefix} rice`, instructions: "Synthetic review fixture.", servings: 2, prepMinutes: 10, favorite: true });
  const mealId = await create({ kind: "meal", title: `${prefix} dinner`, date: "2099-01-02", meal: "Dinner", ingredients: `200 g ${prefix} rice`, servings: 4, groceriesEnabled: true }, recipeId);
  let rows = await shopping();
  assert.equal(rows.length, 1); assert.equal(rows[0].data.kind === "grocery" && rows[0].data.quantity, 400);
  evidence.push("Recipe with 200 g for 2 servings planned for 4 produces 400 g shopping after authenticated reload.");
  const meal = await item(mealId); assert.equal(meal.data.kind === "meal" && meal.data.ingredientServings, 2);
  await save(meal, { ...meal.data, title: `${prefix} dinner renamed` });
  const renamed = await item(mealId); assert.equal(renamed.data.kind === "meal" && renamed.data.ingredientServings, 2);
  evidence.push("Renaming a saved meal preserves its original ingredient portion basis.");
  const pantryId = await create({ kind: "pantry", title: `${prefix} rice`, quantity: 150, unit: "g" });
  rows = await shopping(); assert.equal(rows[0].data.kind === "grocery" && rows[0].data.quantity, 250);
  await save(rows[0], { ...rows[0].data, checked: true } as LifeItem);
  assert.equal((await item(pantryId)).data.kind === "pantry" && ((await item(pantryId)).data as Extract<LifeItem, {kind:"pantry"}>).quantity, 150);
  evidence.push("150 g recorded pantry stock reduces shopping to 250 g; marking purchased does not change pantry.");
  const currentMeal = await item(mealId);
  assert.equal(currentMeal.data.kind, "meal");
  await save(currentMeal, { ...currentMeal.data, servings: 2 } as LifeItem);
  rows = await shopping(); assert.equal(rows[0].data.kind === "grocery" && rows[0].data.quantity, 50); assert.equal(rows[0].data.kind === "grocery" && rows[0].data.checked, true);
  evidence.push("Changing planned servings to 2 recomputes 50 g remaining shopping while preserving the user's purchased checkbox.");
  const manualId = await create({ kind: "grocery", title: `${prefix} manual item`, checked: false });
  const latestMeal = await item(mealId);
  await write({ action: "delete", id: mealId, version: latestMeal.version });
  owned.splice(owned.indexOf(mealId), 1);
  rows = await shopping(); assert.equal(rows.length, 1); assert.equal(rows[0].id, manualId);
  evidence.push("Deleting the meal removes its derived shopping and leaves the manual grocery intact.");
  const calendar = await fetch(`${base}/api/account/calendar/events?start=2026-10-14T00%3A00%3A00Z&end=2026-10-17T00%3A00%3A00Z`, { headers: { cookie } });
  assert.notEqual(calendar.status, 200);
  evidence.push(`Disconnected Google Calendar returns HTTP ${calendar.status}; no fake authenticated calendar success was observed.`);
}

run().then(async () => {
  for (const id of owned.reverse()) { const current = await item(id); await write({ action: "delete", id, version: current.version }); }
  const report = { checkedAt: new Date().toISOString(), syntheticOnly: true, origin: base, status: "passed", checks: evidence, cleanup: "All created recipe, meal, pantry and manual grocery fixtures removed.", limits: "HTTP journey only. Browser unavailable; no visual, camera, Google-auth, worker, carrier, or live AI claims." };
  writeFileSync("qa/customer-review-2026-10-15/meal-api-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}).catch(async error => {
  console.error(error);
  for (const id of owned.reverse()) { const current = (await board()).items.find(value => value.id === id); if (current) { try { await write({ action: "delete", id, version: current.version }); } catch { console.error(`Test-only cleanup pending for ${id}`); } } }
  process.exitCode = 1;
});

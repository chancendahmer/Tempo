import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { mutateWorkspace, readWorkspace } from "./workspace-repository";
import { LifeAssistant } from "./life-assistant";
import type { LifeItem } from "../../domain/life-items";
import { ingredientLabel } from "../../domain/meal-groceries";

describe("transactional meal shopping", () => {
  let client: PGlite, db: TempoDatabase, owner: string, other: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
    [owner, other] = (await db.insert(schema.users).values([{ phoneE164: "+12025550691" }, { phoneE164: "+12025550692" }]).returning()).map(user => user.id);
  }, 30000);
  afterAll(async () => client.close());
  const recipe: Extract<LifeItem, { kind: "recipe" }> = { kind: "recipe", title: "Rice bowl", ingredients: "0.5 kg rice\n1 lemon\nSalt to taste", instructions: "Cook rice", servings: 2, prepMinutes: 20, favorite: false };
  const meal: Extract<LifeItem, { kind: "meal" }> = { kind: "meal", title: "Rice bowl", ingredients: "Untrusted model shortcut", date: "2027-01-14", meal: "Dinner", servings: 4 };
  const groceries = async () => (await readWorkspace(owner, db)).items.filter(item => item.data.kind === "grocery");

  it("reconciles compact recipe units through serving edits, pantry changes and retries", async () => {
    const [person] = await db.insert(schema.users).values({ phoneE164: "+12025550694" }).returning();
    const recipeId = randomUUID(), mealId = randomUUID(), pantryId = randomUUID();
    await mutateWorkspace(person.id, { action: "save", id: recipeId, version: 0, data: { ...recipe, ingredients: "500g rice\n1/2kg RICE\n250ml milk\n1½cups flour" } }, db);
    const saveMeal = { action: "save" as const, id: mealId, version: 0, sourceRecipeId: recipeId, data: meal };
    await mutateWorkspace(person.id, saveMeal, db);
    await mutateWorkspace(person.id, saveMeal, db);
    const initial = (await readWorkspace(person.id, db)).items.filter(item => item.data.kind === "grocery");
    expect(initial.map(item => ingredientLabel(item.data)).sort()).toEqual(["2000 g rice", "500 ml milk", "3 cup flour"].sort());
    const rice = initial.find(item => item.data.title === "rice")!;
    await mutateWorkspace(person.id, { action: "save", id: pantryId, version: 0, data: { kind: "pantry", title: "Rice", quantity: 0.5, unit: "kg" } }, db);
    await mutateWorkspace(person.id, { action: "patch", id: mealId, version: 1, patch: { kind: "meal", servings: 2 } }, db);
    const after = (await readWorkspace(person.id, db)).items.filter(item => item.data.kind === "grocery");
    expect(after.map(item => ingredientLabel(item.data)).sort()).toEqual(["500 g rice", "250 ml milk", "1½ cup flour"].sort());
    expect(after.find(item => item.id === rice.id)?.data).toMatchObject({ quantity: 500, mealSources: [{ mealId, quantity: 1000 }] });
    const reread = (await readWorkspace(person.id, db)).items.filter(item => item.data.kind === "grocery");
    expect(reread).toEqual(after);
  });

  it("preserves the labeled ingredient basis when UI or assistant edits ingredient text", async () => {
    const [person] = await db.insert(schema.users).values({ phoneE164: "+12025550693" }).returning();
    const recipeId = randomUUID(), mealId = randomUUID();
    await mutateWorkspace(person.id, { action: "save", id: recipeId, version: 0, data: { ...recipe, ingredients: "200 g rice", servings: 2 } }, db);
    await mutateWorkspace(person.id, { action: "save", id: mealId, version: 0, sourceRecipeId: recipeId, data: { ...meal, servings: 4 } }, db);
    await mutateWorkspace(person.id, { action: "patch", id: mealId, version: 1, patch: { kind: "meal", ingredients: "200 g rice\n1 lemon" } }, db);
    let workspace = await readWorkspace(person.id, db);
    const planned = workspace.items.find(row => row.id === mealId)!;
    expect(planned.data).toMatchObject({ ingredients: "200 g rice\n1 lemon", ingredientServings: 2, servings: 4 });
    expect(workspace.items.find(row => row.data.kind === "grocery" && row.data.title === "rice")?.data).toMatchObject({ quantity: 400, unit: "g" });
    expect(workspace.items.find(row => row.data.kind === "grocery" && row.data.title === "lemon")?.data).toMatchObject({ quantity: 2 });
    if (planned.data.kind !== "meal") throw Error("Missing meal fixture");
    await mutateWorkspace(person.id, { action: "save", id: mealId, version: planned.version, data: { ...planned.data, ingredients: "300 g rice\n1 lemon\n1 clove garlic" } }, db);
    workspace = await readWorkspace(person.id, db);
    expect(workspace.items.find(row => row.id === mealId)?.data).toMatchObject({ ingredientServings: 2, servings: 4 });
    expect(workspace.items.find(row => row.data.kind === "grocery" && row.data.title === "rice")?.data).toMatchObject({ quantity: 600, unit: "g" });
    expect(workspace.items.find(row => row.data.kind === "grocery" && row.data.title === "garlic")?.data).toMatchObject({ quantity: 2, unit: "clove" });
  });

  it("shares recipe snapshots and grocery reconciliation across UI/SMS, serving edits, removals and retries", async () => {
    const assistant = new LifeAssistant(db), recipeId = randomUUID(), firstId = randomUUID(), secondId = randomUUID(), manualId = randomUUID();
    await mutateWorkspace(owner, { action: "save", id: recipeId, version: 0, data: recipe }, db);
    await mutateWorkspace(owner, { action: "save", id: manualId, version: 0, data: { kind: "grocery", title: "Rice for a neighbor", checked: false } }, db);
    const first = { action: "save" as const, id: firstId, version: 0, sourceRecipeId: recipeId, data: meal };
    await mutateWorkspace(owner, first, db);
    expect((await groceries()).map(item => ingredientLabel(item.data)).sort()).toEqual(["1000 g rice", "2 lemon", "Rice for a neighbor", "Salt to taste"].sort());
    expect((await readWorkspace(owner, db)).items.find(item => item.id === firstId)?.data).toMatchObject({ ingredients: recipe.ingredients, ingredientServings: 2, servings: 4, groceriesEnabled: true });
    const second = { type: "life_save" as const, sourceRecipeId: recipeId, data: { ...meal, servings: 2 } };
    await assistant.execute(owner, secondId, second);
    await assistant.execute(owner, secondId, second);
    await mutateWorkspace(owner, first, db);
    expect((await groceries()).find(item => item.data.kind === "grocery" && item.data.unit === "g")?.data).toMatchObject({ quantity: 1500, mealSources: expect.arrayContaining([{ mealId: firstId, quantity: 1000 }, { mealId: secondId, quantity: 500 }]) });
    const rice = (await groceries()).find(item => item.data.kind === "grocery" && item.data.unit === "g")!;
    await mutateWorkspace(owner, { action: "patch", id: rice.id, version: rice.version, patch: { kind: "grocery", checked: true } }, db);
    const edit = { type: "life_patch" as const, id: firstId, version: 1, patch: { kind: "meal" as const, servings: 1 } }, editSource = randomUUID();
    await assistant.execute(owner, editSource, edit);
    await assistant.execute(owner, editSource, edit);
    expect((await groceries()).find(item => item.id === rice.id)?.data).toMatchObject({ quantity: 750, checked: true });
    await expect(mutateWorkspace(other, { action: "patch", id: firstId, version: 2, patch: { kind: "meal", servings: 8 } }, db)).rejects.toThrow("unavailable");
    expect(await assistant.execute(owner, randomUUID(), edit)).toContain("changed elsewhere");
    // Editing a reusable recipe cannot silently rewrite either planned snapshot.
    await mutateWorkspace(owner, { action: "patch", id: recipeId, version: 1, patch: { kind: "recipe", ingredients: "10 g different ingredient" } }, db);
    await mutateWorkspace(owner, first, db);
    expect((await readWorkspace(owner, db)).items.find(item => item.id === firstId)?.data).toMatchObject({ ingredients: recipe.ingredients, servings: 1 });
    await mutateWorkspace(owner, { action: "delete", id: firstId, version: 2 }, db);
    expect((await groceries()).find(item => item.id === rice.id)?.data).toMatchObject({ quantity: 500, checked: true, mealSources: [{ mealId: secondId, quantity: 500 }] });
    const remove = { type: "life_remove" as const, id: secondId, version: 1 }, removeSource = randomUUID();
    await assistant.execute(owner, removeSource, remove);
    await assistant.execute(owner, removeSource, remove);
    expect(await groceries()).toEqual([expect.objectContaining({ id: manualId })]);
    expect((await readWorkspace(other, db)).items).toHaveLength(0);
  });

  it("subtracts only explicit compatible pantry stock and refuses source forgery", async () => {
    const mealId = randomUUID(), pantryId = randomUUID();
    await mutateWorkspace(owner, { action: "save", id: mealId, version: 0, data: { ...meal, ingredients: "500 g oats\n1 cup oats\nOil to taste", servings: 2 } }, db);
    const oats = (await groceries()).find(item => item.data.kind === "grocery" && item.data.title === "oats" && item.data.unit === "g")!;
    await mutateWorkspace(owner, { action: "patch", id: oats.id, version: oats.version, patch: { kind: "grocery", checked: true } }, db);
    expect((await readWorkspace(owner, db)).items.filter(item => item.data.kind === "pantry")).toHaveLength(0);
    await mutateWorkspace(owner, { action: "save", id: pantryId, version: 0, data: { kind: "pantry", title: "OATS", quantity: 0.2, unit: "kg" } }, db);
    expect((await groceries()).find(item => item.id === oats.id)?.data).toMatchObject({ quantity: 300, checked: true });
    expect((await groceries()).some(item => ingredientLabel(item.data) === "1 cup oats")).toBe(true);
    await expect(mutateWorkspace(owner, { action: "save", id: randomUUID(), version: 0, data: { kind: "grocery", title: "Forged", checked: false, mealSources: [{ mealId, quantity: 1 }] } }, db)).rejects.toThrow("managed");
    const currentOats = (await groceries()).find(item => item.id === oats.id)!;
    await expect(mutateWorkspace(owner, { action: "patch", id: oats.id, version: currentOats.version, patch: { kind: "grocery", quantity: 1000 } }, db)).rejects.toThrow("source meal");
    await expect(mutateWorkspace(owner, { action: "delete", id: oats.id, version: currentOats.version }, db)).rejects.toThrow("source meal");
    await mutateWorkspace(owner, { action: "delete", id: pantryId, version: 1 }, db);
    expect((await groceries()).find(item => item.id === oats.id)?.data).toMatchObject({ quantity: 500, checked: true });
    await expect(mutateWorkspace(other, { action: "save", id: randomUUID(), version: 0, sourceRecipeId: mealId, data: meal }, db)).rejects.toThrow("couldn’t find");
    await mutateWorkspace(owner, { action: "patch", id: mealId, version: 1, patch: { kind: "meal", groceriesEnabled: false } }, db);
    expect((await groceries()).some(item => item.data.kind === "grocery" && item.data.mealSources)).toBe(false);
  });

  it("expires past meal sources on reads while keeping explicit manual requests and unknown ingredients", async () => {
    const mealId = randomUUID(), generatedId = randomUUID();
    // Seed a previously generated shopping row as if the local day advanced.
    await db.insert(schema.lifeItems).values([
      { id: mealId, userId: owner, data: { ...meal, ingredients: "Basil", date: "2000-01-01", ingredientServings: 4, groceriesEnabled: true } },
      { id: generatedId, userId: owner, data: { kind: "grocery", title: "Basil", checked: false, mealSources: [{ mealId, quantity: null }] } },
    ]);
    const assistant = new LifeAssistant(db);
    await assistant.execute(owner, randomUUID(), { type: "grocery_add", items: ["Basil"] });
    const listing = JSON.parse(await assistant.execute(owner, randomUUID(), { type: "life_list", kind: "grocery", query: "Basil" }));
    expect(listing.items).toHaveLength(1);
    expect(listing.items[0].data).toEqual({ kind: "grocery", title: "Basil", checked: false });
    expect((await groceries()).some(item => item.id === generatedId)).toBe(false);
  });

  it("persists nullable self-chosen targets once per account and rejects duplicate or foreign edits", async () => {
    const id = randomUUID(), data: LifeItem = { kind: "nutrition_target", title: "Daily targets", calories: null, protein: 90, carbs: null, fat: null, fiber: null };
    await mutateWorkspace(owner, { action: "save", id, version: 0, data }, db);
    await mutateWorkspace(owner, { action: "save", id, version: 0, data }, db);
    await expect(mutateWorkspace(owner, { action: "save", id: randomUUID(), version: 0, data }, db)).rejects.toThrow("already exist");
    await expect(mutateWorkspace(other, { action: "patch", id, version: 1, patch: { kind: "nutrition_target", protein: 100 } }, db)).rejects.toThrow("unavailable");
    await mutateWorkspace(owner, { action: "patch", id, version: 1, patch: { kind: "nutrition_target", fiber: 25 } }, db);
    expect((await readWorkspace(owner, db)).items.find(item => item.id === id)?.data).toEqual({ ...data, fiber: 25 });
  });

  it("does not invent a serving basis when a meal's original portions are unknown", async () => {
    const id = randomUUID();
    await mutateWorkspace(owner, { action: "save", id, version: 0, data: { kind: "meal", title: "Unknown portions", date: "2027-01-14", meal: "Dinner", ingredients: "500 g lentils" } }, db);
    await mutateWorkspace(owner, { action: "patch", id, version: 1, patch: { kind: "meal", servings: 4 } }, db);
    expect((await groceries()).find(item => item.data.title === "lentils")?.data).toMatchObject({ quantity: 500 });
    await mutateWorkspace(owner, { action: "patch", id, version: 2, patch: { kind: "meal", servings: 8 } }, db);
    expect((await groceries()).find(item => item.data.title === "lentils")?.data).toMatchObject({ quantity: 1000 });
    await mutateWorkspace(owner, { action: "delete", id, version: 3 }, db);
  });
});

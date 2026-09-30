import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { mutateWorkspace, readWorkspace } from "./workspace-repository";
import { LifeAssistant } from "./life-assistant";
import { WebReplySender, isWebMessage } from "./web-reply-repository";
import { DrizzleConversationHistoryRepository } from "./conversation-history-repository";
import type { LifeItem } from "../../domain/life-items";

describe("shared life workspace", () => {
  let client: PGlite, db: TempoDatabase, owner: string, other: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
    const users = await db.insert(schema.users).values([{ phoneE164: "+12025550181", timezone: "America/New_York", onboardingState: "complete" }, { phoneE164: "+12025550182", onboardingState: "complete" }]).returning();
    [owner, other] = users.map(u => u.id);
  }, 30000);
  afterAll(async () => client.close());
  const recipe: LifeItem = { kind: "recipe", title: "Lemon rice", ingredients: "Rice\nLemon", instructions: "Cook rice, add lemon.", servings: 2, prepMinutes: 20, favorite: true };

  it("saves recipes from the assistant into the same account workspace and handles replay", async () => {
    const assistant = new LifeAssistant(db), source = randomUUID();
    const command = { type: "life_save" as const, data: recipe };
    expect(await assistant.execute(owner, source, command)).toContain("Saved");
    await assistant.execute(owner, source, command);
    const data = await readWorkspace(owner, db);
    expect(data.items.filter(item => item.id === source)).toHaveLength(1);
    expect(data.items.find(item => item.id === source)?.data).toEqual(recipe);
    expect((await readWorkspace(other, db)).items).toHaveLength(0);
  });

  it("rejects a changed create replay rather than claiming the different payload was saved", async () => {
    const assistant = new LifeAssistant(db), source = randomUUID();
    await assistant.execute(owner, source, { type: "life_save", data: recipe });
    expect(await assistant.execute(owner, source, { type: "life_save", data: { ...recipe, servings: 9 } })).toContain("different change");
    expect((await readWorkspace(owner, db)).items.find(item => item.id === source)?.data).toEqual(recipe);
  });

  it.each<LifeItem>([
    { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [{ id: "00000000-0000-4000-8000-000000000092", title: "Water", minutes: 2, completedOn: null }] },
    { kind: "food", title: "Yogurt", date: "2026-09-28", meal: "Breakfast", calories: 100, protein: 8, carbs: null, fat: null, fiber: null },
    { kind: "meal", title: "Rice bowl", date: "2026-09-28", meal: "Dinner", ingredients: "Rice" },
    { kind: "workout", title: "Walk", date: "2026-09-28", minutes: 20, activity: "Walk" },
    { kind: "note", title: "Weekend", body: "Visit the garden" },
    { kind: "grocery", title: "Oats", checked: false },
  ])("shares assistant CRUD for $kind with the app and isolates other accounts", async data => {
    const assistant = new LifeAssistant(db), id = randomUUID();
    await assistant.execute(owner, id, { type: "life_save", data });
    const rows = JSON.parse(await assistant.execute(owner, randomUUID(), { type: "life_list", kind: data.kind as "routine" }));
    expect(rows.find((row: { id: string }) => row.id === id)).toMatchObject({ version: 1, data });
    expect(JSON.parse(await assistant.execute(other, randomUUID(), { type: "life_list", kind: data.kind as "routine" })).some((row: { id: string }) => row.id === id)).toBe(false);
    const updated = { ...data, title: `${data.title} updated` };
    await assistant.execute(owner, randomUUID(), { type: "life_save", id, version: 1, data: updated });
    expect((await readWorkspace(owner, db)).items.find(item => item.id === id)).toMatchObject({ version: 2, data: updated });
    await assistant.execute(owner, randomUUID(), { type: "life_remove", id, version: 2 });
    expect((await readWorkspace(owner, db)).items.some(item => item.id === id)).toBe(false);
  });

  it("rejects foreign IDs and stale writes, while retrying an assistant edit and deletion safely", async () => {
    const id = randomUUID();
    await mutateWorkspace(owner, { action: "save", id, version: 0, data: recipe }, db);
    await expect(mutateWorkspace(other, { action: "save", id, version: 1, data: recipe }, db)).rejects.toThrow();
    await expect(mutateWorkspace(other, { action: "delete", id, version: 1 }, db)).rejects.toThrow();
    const assistant = new LifeAssistant(db), source = randomUUID();
    const edit = { type: "life_save" as const, id, version: 1, data: { ...recipe, title: "Lemon rice bowl" } };
    await assistant.execute(owner, source, edit);
    expect(await assistant.execute(owner, source, edit)).toBe("Updated: Lemon rice bowl. Serves 2.");
    expect(await assistant.execute(owner, source, { ...edit, data: { ...recipe, title: "Different mutation" } })).toContain("different change");
    await expect(mutateWorkspace(owner, { action: "save", id, version: 1, data: recipe }, db)).rejects.toThrow("changed elsewhere");
    const removal = { type: "life_remove" as const, id, version: 2 }, removeSource = randomUUID();
    expect(await assistant.execute(owner, removeSource, removal)).toBe("Removed.");
    expect(await assistant.execute(owner, removeSource, removal)).toBe("Removed.");
  });

  it("keeps task creation atomic and idempotent, and clears a paused focus when the task completes", async () => {
    const requestId = randomUUID();
    const create = { action: "task" as const, requestId, command: { type: "create_task" as const, title: "Do the dishes", estimatedMinutes: 10 } };
    await mutateWorkspace(owner, create, db); await mutateWorkspace(owner, create, db);
    const created = (await readWorkspace(owner, db)).tasks.filter(t => t.title === "Do the dishes");
    expect(created).toHaveLength(1);
    const taskId = created[0].id;
    await mutateWorkspace(owner, { action: "task", requestId: randomUUID(), command: { type: "start_task", taskId } }, db);
    const id = randomUUID();
    await mutateWorkspace(owner, { action: "save", id, version: 0, data: { kind: "focus", title: "Do the dishes", taskId, endsAt: null, remaining: 90 } }, db);
    await mutateWorkspace(owner, { action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId } }, db);
    const after = await readWorkspace(owner, db);
    expect(after.tasks.find(t => t.id === taskId)?.status).toBe("completed");
    expect(after.items.some(item => item.id === id)).toBe(false);
    await expect(mutateWorkspace(other, { action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId } }, db)).rejects.toThrow();
  });

  it("finishes a routine step and its timer atomically, preserves neighboring steps, and validates ownership", async () => {
    const id = randomUUID(), stepId = randomUUID(), second = randomUUID();
    await mutateWorkspace(owner, { action: "save", id, version: 0, data: { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [{ id: stepId, title: "Water", minutes: 1, completedOn: null }, { id: second, title: "Breakfast", minutes: 10, completedOn: null }] } }, db);
    const focusId = randomUUID();
    const focus: LifeItem = { kind: "focus", title: "Water", routineId: id, stepId, endsAt: null, remaining: 60 };
    await expect(mutateWorkspace(other, { action: "save", id: randomUUID(), version: 0, data: focus }, db)).rejects.toThrow();
    await mutateWorkspace(owner, { action: "save", id: focusId, version: 0, data: focus }, db);
    await expect(mutateWorkspace(owner, { action: "save", id: randomUUID(), version: 0, data: focus }, db)).rejects.toThrow("already running");
    await mutateWorkspace(owner, { action: "finish_focus", id: focusId, version: 1 }, db);
    const result = await readWorkspace(owner, db), routine = result.items.find(item => item.id === id)?.data;
    expect(result.items.some(item => item.id === focusId)).toBe(false);
    if (routine?.kind !== "routine") throw new Error("Missing routine");
    expect(routine.steps[0].completedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(routine.steps[1].completedOn).toBeNull();
  });

  it("enqueues web messages once and stores a shared-history reply without an SMS provider", async () => {
    const input = { action: "chat" as const, requestId: randomUUID(), text: "Save my lemon rice recipe" };
    await mutateWorkspace(owner, input, db); await mutateWorkspace(owner, input, db);
    const [source] = await db.select().from(schema.conversationMessages).where(and(eq(schema.conversationMessages.userId, owner), eq(schema.conversationMessages.body, input.text)));
    expect(await isWebMessage(source.id, db)).toBe(true);
    const jobs = await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.idempotencyKey, `web-process:${source.id}`));
    expect(jobs).toHaveLength(1);
    const sender = new WebReplySender(source.id, db);
    const reply = { userId: owner, body: "Saved your recipe.", kind: "coach" as const, idempotencyKey: `reply:${source.id}` };
    await sender.send(reply); await sender.send(reply);
    await expect(sender.send({ ...reply, userId: other })).rejects.toThrow();
    const outbound = await db.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, reply.idempotencyKey));
    expect(outbound).toHaveLength(1); expect(outbound[0].provider).toBeNull();
    expect((await readWorkspace(owner, db)).messages.some(m => m.body === reply.body)).toBe(true);
    const followup = await db.insert(schema.conversationMessages).values({ userId: owner, conversationId: source.conversationId, direction: "inbound", kind: "user", status: "received", body: "What ingredients did I save?", createdAt: new Date(Date.now() + 1000) }).returning();
    const history = await new DrizzleConversationHistoryRepository(db).getRecent({ conversationId: source.conversationId, beforeMessageId: followup[0].id, limit: 10 });
    expect(history.some(m => m.content === reply.body)).toBe(true);
    expect(history.find(m => m.content === reply.body)?.replyToMessageId).toBe(source.id);
  });
});

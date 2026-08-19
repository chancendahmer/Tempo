import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeTaskCommand } from "../../domain/task-service";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import { conversationMessages, goals, taskEvents, tasks, users } from "../schema";
import { DrizzleTaskRepository } from "./task-repository";

describe("task repository audit trail", () => {
  let client: PGlite;
  let database: TempoDatabase;
  let userId: string;
  let createMessageId: string;
  let completeMessageId: string;

  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      const migration = (await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll(
        "--> statement-breakpoint",
        "",
      );
      await client.exec(migration);
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
    const [createdUser] = await database
      .insert(users)
      .values({ phoneE164: "+12025550198" })
      .returning({ id: users.id });
    userId = createdUser.id;
    const messages = await database
      .insert(conversationMessages)
      .values([
        { userId, direction: "inbound", kind: "user", status: "received", body: "Add the report" },
        { userId, direction: "inbound", kind: "user", status: "received", body: "Done with the report" },
      ])
      .returning({ id: conversationMessages.id });
    [createMessageId, completeMessageId] = messages.map((message) => message.id);
  });

  afterAll(async () => {
    await client.close();
  });

  it("traces creation and completion to their exact source messages", async () => {
    const repository = new DrizzleTaskRepository(database);
    const created = await executeTaskCommand(
      repository,
      { type: "create_task", title: "Finish report", estimatedMinutes: 60 },
      { userId, sourceMessageId: createMessageId, now: new Date("2026-08-18T12:00:00Z") },
    );
    expect(created.kind).toBe("executed");

    await executeTaskCommand(
      repository,
      { type: "complete_task", taskQuery: "report" },
      { userId, sourceMessageId: completeMessageId, now: new Date("2026-08-18T13:00:00Z") },
    );

    const [storedTask] = await database.select().from(tasks).where(eq(tasks.userId, userId));
    const events = await database.select().from(taskEvents).where(eq(taskEvents.taskId, storedTask.id));
    expect(storedTask.status).toBe("completed");
    expect(events.map((event) => [event.eventType, event.sourceMessageId])).toEqual([
      ["created", createMessageId],
      ["completed", completeMessageId],
    ]);
  });

  it("links a task only to an active goal owned by the same user", async () => {
    const [otherUser] = await database.insert(users).values({ phoneE164: "+12025550193" }).returning({ id: users.id });
    const [ownedGoal] = await database.insert(goals).values({ userId, title: "Finish my degree" }).returning({ id: goals.id });
    const [foreignGoal] = await database.insert(goals).values({ userId: otherUser.id, title: "Private goal" }).returning({ id: goals.id });
    const messages = await database.insert(conversationMessages).values([
      { userId, direction: "inbound", kind: "user", status: "received", body: "Add thesis outline to my degree goal" },
      { userId, direction: "inbound", kind: "user", status: "received", body: "Add a task to another user's goal" },
    ]).returning({ id: conversationMessages.id });
    const repository = new DrizzleTaskRepository(database);
    const created = await executeTaskCommand(repository, {
      type: "create_task", title: "Outline thesis", goalId: ownedGoal.id,
    }, { userId, sourceMessageId: messages[0].id, now: new Date("2026-08-19T12:00:00Z") });
    expect(created).toMatchObject({ kind: "executed", task: { goalId: ownedGoal.id } });
    await expect(executeTaskCommand(repository, {
      type: "create_task", title: "Unauthorized task", goalId: foreignGoal.id,
    }, { userId, sourceMessageId: messages[1].id, now: new Date("2026-08-19T12:01:00Z") }))
      .rejects.toThrow("Goal not found or not owned by user");
    expect(await database.select().from(tasks).where(eq(tasks.sourceMessageId, messages[1].id))).toHaveLength(0);
  });
});

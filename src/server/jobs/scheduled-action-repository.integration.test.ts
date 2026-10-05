import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TempoDatabase } from "../db/client";
import * as schema from "../db/schema";
import { scopedDatabase } from "../db/database-scope";
import { randomUUID } from "node:crypto";
import { scheduledActions, users } from "../db/schema";
import { ScheduledActionRepository } from "./scheduled-action-repository";

describe("scheduled action lifecycle", () => {
  let client: PGlite;
  let database: TempoDatabase;
  let userId: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = scopedDatabase(drizzle(client, { schema }) as unknown as TempoDatabase);
    const [user] = await database.insert(users).values({ phoneE164: "+12025550177" }).returning({ id: users.id });
    userId = user.id;
  });
  afterAll(async () => client.close());

  it("atomically completes a recurring tick and creates exactly one successor", async () => {
    const [action] = await database.insert(scheduledActions).values({
      userId, kind: "evaluate_context", payload: {}, idempotencyKey: "context:test:current",
      status: "running", runAt: new Date("2026-08-18T12:00:00Z"),
    }).returning({ id: scheduledActions.id });
    const repository = new ScheduledActionRepository(database);
    expect(await repository.markRunning(action.id)).toBe(true);
    await repository.completeAndScheduleContextEvaluation(action.id, userId, new Date("2026-08-18T12:15:00Z"));
    await repository.completeAndScheduleContextEvaluation(action.id, userId, new Date("2026-08-18T12:20:00Z"));
    expect(await repository.markRunning(action.id)).toBe(false);
    const rows = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, userId));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === action.id)?.status).toBe("completed");
    expect(rows.find((row) => row.id !== action.id)).toMatchObject({ status: "scheduled", kind: "evaluate_context" });
  });
  it.each(["sync_calendar", "evaluate_context"] as const)("fences overlapping %s attempts and their late failures", async kind => {
    const [action] = await database.insert(scheduledActions).values({userId,kind,payload:{},idempotencyKey:randomUUID(),runAt:new Date()}).returning();
    const first = new ScheduledActionRepository(database), second = new ScheduledActionRepository(database);
    const controller = new AbortController();
    const owner = await first.claimRecurring(action.id,controller.signal,10000);
    await expect(second.claimRecurring(action.id,new AbortController().signal,10000)).rejects.toThrow("still owned");
    await database.update(scheduledActions).set({attemptExpiresAt:new Date(Date.now()-1000)}).where(eq(scheduledActions.id,action.id));
    expect(await second.claimRecurring(action.id,new AbortController().signal,10000)).toBeTruthy();
    await expect(owner!.run(async()=>{throw Error("must not run");})).rejects.toThrow("ownership lost");
    await first.markFailed(action.id,"stale failure");
    const finish = kind === "sync_calendar" ? second.completeAndScheduleCalendarSync.bind(second) : second.completeAndScheduleContextEvaluation.bind(second);
    await finish(action.id,userId,new Date(Date.now()+60000));
    await finish(action.id,userId,new Date(Date.now()+120000));
    await first.scheduleRecurringRecovery({failedActionId:action.id,userId,kind,runAt:new Date()});
    const rows=await database.select().from(scheduledActions);
    expect(rows.find(r=>r.id===action.id)?.status).toBe("completed");
    expect(rows.filter(r=>r.idempotencyKey.endsWith("after:"+action.id))).toHaveLength(1);
    expect(rows.some(r=>r.idempotencyKey==="recovery:"+action.id)).toBe(false);
  });
});

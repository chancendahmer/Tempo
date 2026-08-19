import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TempoDatabase } from "../db/client";
import * as schema from "../db/schema";
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
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
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
    expect(await repository.markRunning(action.id)).toBe(false);
    const rows = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, userId));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === action.id)?.status).toBe("completed");
    expect(rows.find((row) => row.id !== action.id)).toMatchObject({ status: "scheduled", kind: "evaluate_context" });
  });
});

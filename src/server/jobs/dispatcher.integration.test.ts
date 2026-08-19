import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TempoDatabase } from "../db/client";
import * as schema from "../db/schema";
import { scheduledActions, users } from "../db/schema";
import { dispatchDueActions } from "./dispatcher";
import { JOB_NAMES } from "./names";

describe("scheduled-action queue handoff", () => {
  let client: PGlite;
  let database: TempoDatabase;
  let boss: PgBoss;
  const send = vi.fn(async (_name: string, _data: object, options: { id?: string }) => options.id ?? null);

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
    boss = { send } as unknown as PgBoss;
  });

  afterAll(async () => {
    await client.close();
  });

  it("atomically moves a due action into pg-boss once", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550198" }).returning();
    const [action] = await database
      .insert(scheduledActions)
      .values({
        userId: user.id,
        kind: "send_welcome",
        idempotencyKey: `welcome:${user.id}:test`,
        runAt: new Date("2026-08-18T12:00:00Z"),
      })
      .returning();

    expect(await dispatchDueActions(boss, 25, database)).toBe(1);
    expect(await dispatchDueActions(boss, 25, database)).toBe(0);

    const [stored] = await database.select().from(scheduledActions).where(eq(scheduledActions.id, action.id));
    expect(stored.status).toBe("running");
    expect(stored.queueJobId).toBe(action.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      JOB_NAMES.sendWelcome,
      expect.objectContaining({
        scheduledActionId: action.id,
        userId: user.id,
        idempotencyKey: action.idempotencyKey,
      }),
      expect.objectContaining({ id: action.id, singletonKey: user.id }),
    );
  });
});

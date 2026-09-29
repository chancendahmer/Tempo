import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import { readBoard } from "./board-repository";

let client: PGlite;
let database: TempoDatabase;
beforeAll(async () => {
  client = new PGlite();
  for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  database = drizzle(client, { schema }) as unknown as TempoDatabase;
});
afterAll(async () => { await client.close(); });

it("isolates accounts, excludes finished tasks and cancelled reminders, and hides disconnected calendar windows", async () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const [owner, other] = await database.insert(schema.users).values([
    { phoneE164: "+12025550171", timezone: "America/New_York" }, { phoneE164: "+12025550172" },
  ]).returning();
  await database.insert(schema.tasks).values([
    { userId: owner.id, title: "Breakfast" }, { userId: owner.id, title: "Finished", status: "completed" },
    { userId: other.id, title: "Private" },
  ]);
  await database.insert(schema.reminders).values([
    { userId: owner.id, text: "Eat", remindAt: now, timezone: "UTC", idempotencyKey: "board-1" },
    { userId: owner.id, text: "Cancelled", remindAt: now, timezone: "UTC", idempotencyKey: "board-2", status: "cancelled" },
    { userId: other.id, text: "Private", remindAt: now, timezone: "UTC", idempotencyKey: "board-3" },
    { userId: owner.id, text: "Old", remindAt: new Date("2026-09-27T12:00:00Z"), timezone: "UTC", idempotencyKey: "board-4" },
  ]);
  const [connection] = await database.insert(schema.calendarConnections).values({ userId: owner.id, status: "disconnected" }).returning();
  await database.insert(schema.calendarBusyWindows).values({ userId: owner.id, connectionId: connection.id, startsAt: now, endsAt: new Date(now.getTime() + 60_000), sourceHash: "board-test" });
  const result = await readBoard(owner.id, now, database);
  expect(result.timezone).toBe("America/New_York");
  expect(result.tasks.map(item => item.title)).toEqual(["Breakfast"]);
  expect(result.reminders.map(item => item.text)).toEqual(["Eat"]);
  expect(result.busy).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("Private");
});

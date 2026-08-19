import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount } from "../../domain/account-controls";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import { calendarBusyWindows, calendarConnections, tasks, users } from "../schema";
import { DrizzleAccountControlRepository } from "./account-control-repository";

describe("account controls", () => {
  let client: PGlite;
  let database: TempoDatabase;

  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
  });
  afterAll(async () => client.close());

  it("erases tokens and cached availability when calendar is disconnected", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550172" }).returning({ id: users.id });
    const [connection] = await database.insert(calendarConnections).values({
      userId: user.id,
      encryptedAccessToken: "encrypted-access",
      encryptedRefreshToken: "encrypted-refresh",
      scopes: ["freebusy"],
    }).returning({ id: calendarConnections.id });
    await database.insert(calendarBusyWindows).values({
      userId: user.id,
      connectionId: connection.id,
      startsAt: new Date("2026-08-19T10:00:00Z"),
      endsAt: new Date("2026-08-19T11:00:00Z"),
      sourceHash: "opaque-hash",
    });

    await new DrizzleAccountControlRepository(database).disconnectCalendar(user.id, new Date("2026-08-18T12:00:00Z"));
    const [stored] = await database.select().from(calendarConnections).where(eq(calendarConnections.id, connection.id));
    expect(stored).toMatchObject({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null, scopes: [] });
    expect(await database.select().from(calendarBusyWindows)).toHaveLength(0);
  });

  it("requires explicit confirmation and cascade-deletes the account", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550173" }).returning({ id: users.id });
    await database.insert(tasks).values({ userId: user.id, title: "Private task" });
    const repository = new DrizzleAccountControlRepository(database);
    await expect(deleteAccount(repository, { userId: user.id, confirmation: "delete" })).rejects.toThrow("Type DELETE");
    expect(await deleteAccount(repository, { userId: user.id, confirmation: "DELETE" })).toBe(true);
    expect(await database.select().from(tasks).where(eq(tasks.userId, user.id))).toHaveLength(0);
    expect(await database.select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
  });
});

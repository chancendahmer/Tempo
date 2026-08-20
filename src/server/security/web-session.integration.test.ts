import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TempoDatabase } from "../db/client";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { WebSessionService } from "./web-session";

describe("phone-linked web sessions", () => {
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

  it("keeps a signup pending until the phone is verified, then supports profile data and revocation", async () => {
    const [user] = await database.insert(users).values({ phoneE164: "+12025550177", onboardingState: "introduction" }).returning();
    const sessions = new WebSessionService(database);
    const created = await sessions.create(user.id, new Date("2026-08-20T12:00:00Z"));

    expect(await sessions.findAccount(created.token, new Date("2026-08-20T12:01:00Z"))).toMatchObject({
      userId: user.id,
      phoneVerified: false,
      phoneLast4: "0177",
    });

    await database.update(users).set({ phoneVerifiedAt: new Date("2026-08-20T12:02:00Z") }).where(eq(users.id, user.id));
    expect(await sessions.findAccount(created.token, new Date("2026-08-20T12:02:30Z"))).toMatchObject({ phoneVerified: false });
    await sessions.activatePending(user.id, new Date("2026-08-20T12:02:45Z"));
    await sessions.updateProfile(user.id, { displayName: "Chance", profileInstructions: "Keep choices short." }, new Date("2026-08-20T12:03:00Z"));
    expect(await sessions.findAccount(created.token, new Date("2026-08-20T12:04:00Z"))).toMatchObject({
      phoneVerified: true,
      displayName: "Chance",
      profileInstructions: "Keep choices short.",
      profileComplete: true,
    });

    await sessions.revoke(created.token, new Date("2026-08-20T12:05:00Z"));
    expect(await sessions.findAccount(created.token, new Date("2026-08-20T12:06:00Z"))).toBeNull();
  });
});

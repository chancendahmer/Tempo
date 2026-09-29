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
import { randomBytes, randomUUID } from "node:crypto";
import { issueActionToken } from "./action-token";

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

  it("redeems once, activates only the requested browser, and signs in the phone separately", async () => {
    const now = new Date();
    const key = randomBytes(32).toString("base64");
    const [user] = await database.insert(users).values({ phoneE164: "+12025550178" }).returning();
    const [other] = await database.insert(users).values({ phoneE164: "+12025550179" }).returning();
    const sessions = new WebSessionService(database);
    const target = await sessions.create(user.id, now);
    const unrelated = await sessions.create(user.id, now);
    const outsider = await sessions.create(other.id, now);
    const token = issueActionToken({ userId: user.id, scope: "account:signin", sessionId: target.id }, key, now);
    const phone = await sessions.redeemSignIn(token, key, now);
    expect(phone.token).not.toBe(target.token);
    expect(await sessions.findAccount(target.token, now)).toMatchObject({ userId: user.id, phoneVerified: true });
    expect(await sessions.findAccount(phone.token, now)).toMatchObject({ userId: user.id, phoneVerified: true });
    expect(await sessions.findAccount(unrelated.token, now)).toMatchObject({ phoneVerified: false });
    expect(await sessions.findAccount(outsider.token, now)).toMatchObject({ phoneVerified: false });
    await expect(sessions.redeemSignIn(token, key, now)).rejects.toThrow("invalid or has expired");
  });

  it("rejects expired, revoked, mismatched and unbound links", async () => {
    const now = new Date();
    const key = randomBytes(32).toString("base64");
    const [user] = await database.insert(users).values({ phoneE164: "+12025550180" }).returning();
    const sessions = new WebSessionService(database);
    const session = await sessions.create(user.id, now);
    const token = issueActionToken({ userId: user.id, scope: "account:signin", sessionId: session.id }, key, now);
    await expect(sessions.redeemSignIn(token, key, new Date(now.getTime() + 16 * 60_000))).rejects.toThrow();
    const mismatch = issueActionToken({ userId: randomUUID(), scope: "account:signin", sessionId: session.id }, key, now);
    await expect(sessions.redeemSignIn(mismatch, key, now)).rejects.toThrow();
    const unbound = issueActionToken({ userId: user.id, scope: "account:signin" }, key, now);
    await expect(sessions.redeemSignIn(unbound, key, now)).rejects.toThrow();
    await sessions.revoke(session.token, now);
    await expect(sessions.redeemSignIn(token, key, now)).rejects.toThrow();
  });

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

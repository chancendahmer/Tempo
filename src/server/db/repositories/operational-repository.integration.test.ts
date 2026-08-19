import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import { consentRecords, oauthStates, rateLimitBuckets, users } from "../schema";
import { OperationalRepository } from "./operational-repository";

describe("operational controls", () => {
  let client: PGlite;
  let database: TempoDatabase;
  let repository: OperationalRepository;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
    repository = new OperationalRepository(database);
  });
  afterAll(async () => client.close());

  it("atomically enforces a fixed-window request limit", async () => {
    const now = new Date("2026-08-18T12:01:00Z");
    expect(await repository.consumeRateLimit({ key: "signup:test", limit: 2, windowMs: 900_000, now }))
      .toMatchObject({ allowed: true, remaining: 1 });
    expect(await repository.consumeRateLimit({ key: "signup:test", limit: 2, windowMs: 900_000, now }))
      .toMatchObject({ allowed: true, remaining: 0 });
    expect(await repository.consumeRateLimit({ key: "signup:test", limit: 2, windowMs: 900_000, now }))
      .toMatchObject({ allowed: false, remaining: 0 });
  });

  it("updates a durable worker heartbeat", async () => {
    const now = new Date("2026-08-18T12:00:00Z");
    await repository.heartbeat("tempo-worker", { workerId: "test-worker" }, now);
    expect(await repository.getHeartbeat("tempo-worker")).toMatchObject({
      serviceKey: "tempo-worker",
      lastSeenAt: now,
      metadata: { workerId: "test-worker" },
    });
  });

  it("removes expired OAuth state and old rate-limit buckets without touching current rows", async () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const [user] = await database.insert(users).values({ phoneE164: "+12025550176" }).returning({ id: users.id });
    await database.insert(oauthStates).values([
      { userId: user.id, stateHash: "expired", expiresAt: new Date("2026-08-18T11:59:00Z") },
      { userId: user.id, stateHash: "current", expiresAt: new Date("2026-08-18T12:30:00Z") },
    ]);
    await database.insert(rateLimitBuckets).values([
      { key: "old", windowStart: new Date("2026-08-17T11:00:00Z") },
      { key: "current", windowStart: new Date("2026-08-18T11:45:00Z") },
    ]);

    expect(await repository.cleanupExpiredData(now)).toEqual({ oauthStates: 1, rateLimitBuckets: 1 });
    expect((await database.select().from(oauthStates)).map((row) => row.stateHash)).toEqual(["current"]);
    expect((await database.select().from(rateLimitBuckets)).map((row) => row.key)).toContain("current");
  });

  it("counts only users whose latest consent is granted", async () => {
    const baseline = await repository.countEarlyAccess();
    const [user] = await database.insert(users).values({ phoneE164: "+12025550174" }).returning({ id: users.id });
    const consent = {
      userId: user.id,
      channel: "web" as const,
      disclosureVersion: "test",
      termsVersion: "test",
      privacyVersion: "test",
    };
    await database.insert(consentRecords).values({ ...consent, status: "granted", createdAt: new Date("2026-08-18T12:00:00Z") });
    expect(await repository.countEarlyAccess()).toBe(baseline + 1);
    await database.insert(consentRecords).values({ ...consent, status: "revoked", createdAt: new Date("2026-08-18T12:01:00Z") });
    expect(await repository.countEarlyAccess()).toBe(baseline);
  });
});

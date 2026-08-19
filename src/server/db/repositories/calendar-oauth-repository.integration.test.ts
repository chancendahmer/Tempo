import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CalendarOAuthProvider } from "../../adapters/calendar/calendar-provider";
import { beginCalendarOAuth, completeCalendarOAuth } from "../../domain/calendar-oauth";
import { decryptField } from "../../security/field-encryption";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import { calendarConnections, oauthStates, scheduledActions, users } from "../schema";
import { DrizzleCalendarOAuthRepository } from "./calendar-oauth-repository";

const key = Buffer.alloc(32, 5).toString("base64");

describe("calendar OAuth repository", () => {
  let client: PGlite;
  let database: TempoDatabase;
  let userId: string;

  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
    const [user] = await database.insert(users).values({ phoneE164: "+12025550171" }).returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => client.close());

  it("uses PKCE, encrypts tokens, and consumes state exactly once", async () => {
    let exchangedVerifier = "";
    const provider: CalendarOAuthProvider = {
      authorizationUrl: ({ state, codeChallenge }) => `https://accounts.example/authorize?state=${state}&challenge=${codeChallenge}`,
      exchangeCode: async ({ code, codeVerifier }) => {
        expect(code).toBe("authorization-code");
        exchangedVerifier = codeVerifier;
        return {
          accessToken: "plain-access-token",
          refreshToken: "plain-refresh-token",
          expiresAt: new Date("2026-08-19T12:00:00Z"),
          scopes: ["freebusy"],
        };
      },
    };
    const repository = new DrizzleCalendarOAuthRepository(database);
    const url = new URL(await beginCalendarOAuth({ userId, repository, provider, encryptionKey: key }));
    const state = url.searchParams.get("state")!;
    expect(url.searchParams.get("challenge")).toHaveLength(43);
    expect(state).toBeTruthy();

    await completeCalendarOAuth({ state, code: "authorization-code", repository, provider, encryptionKey: key });
    expect(exchangedVerifier.length).toBeGreaterThan(40);

    const [connection] = await database.select().from(calendarConnections).where(eq(calendarConnections.userId, userId));
    expect(connection.encryptedAccessToken).not.toContain("plain-access-token");
    expect(connection.encryptedRefreshToken).not.toContain("plain-refresh-token");
    expect(decryptField(connection.encryptedAccessToken!, key)).toBe("plain-access-token");
    expect(decryptField(connection.encryptedRefreshToken!, key)).toBe("plain-refresh-token");
    expect(connection.scopes).toEqual(["freebusy"]);

    const [oauthState] = await database.select().from(oauthStates);
    expect(oauthState.usedAt).toBeInstanceOf(Date);
    const syncJobs = await database.select().from(scheduledActions).where(eq(scheduledActions.userId, userId));
    expect(syncJobs.map((job) => job.kind)).toContain("sync_calendar");
    await expect(completeCalendarOAuth({ state, code: "authorization-code", repository, provider, encryptionKey: key }))
      .rejects.toThrow("invalid, expired, or already used");
  });

  it("rejects an expired OAuth state", async () => {
    const repository = new DrizzleCalendarOAuthRepository(database);
    await repository.createState({
      userId,
      stateHash: "expired-state-hash",
      encryptedCodeVerifier: "encrypted-verifier",
      expiresAt: new Date("2026-08-18T11:59:00Z"),
    });
    await expect(repository.consumeState("expired-state-hash", new Date("2026-08-18T12:00:00Z")))
      .resolves.toBeNull();
  });
});

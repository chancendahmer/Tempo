import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateUserContext } from "../../domain/context-evaluation-service";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import { calendarConnections, consentRecords, contextSnapshots, conversationMessages, interventionPolicies, interventions, scheduledActions, tasks, users } from "../schema";
import { DrizzleContextEngineRepository } from "./context-engine-repository";
import { DrizzleInterventionRepository } from "./intervention-repository";

describe("shadow context evaluation", () => {
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

  it("persists reproducible decisions and never creates an outbound SMS", async () => {
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550174",
      status: "active",
      onboardingState: "complete",
      timezone: "UTC",
    }).returning({ id: users.id });
    await database.insert(consentRecords).values({
      userId: user.id,
      status: "granted",
      channel: "web",
      disclosureVersion: "test",
      termsVersion: "test",
      privacyVersion: "test",
    });
    await database.insert(tasks).values({
      userId: user.id,
      title: "Submit report",
      estimatedMinutes: 30,
      dueAt: new Date("2026-08-18T16:00:00Z"),
    });
    await database.insert(calendarConnections).values({
      userId: user.id,
      encryptedRefreshToken: "test-only",
      scopes: ["freebusy"],
      lastSyncedAt: new Date("2026-08-18T13:55:00Z"),
    });
    const repository = new DrizzleContextEngineRepository(database);
    const result = await evaluateUserContext({
      userId: user.id,
      repository,
      shadowMode: true,
      now: new Date("2026-08-18T14:00:00Z"),
    });
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error("expected evaluation");
    expect(result.evaluation.decision).toBe("shadow");

    const [snapshot] = await database.select().from(contextSnapshots).where(eq(contextSnapshots.userId, user.id));
    expect(snapshot.reasonCodes).toContain("above_threshold_shadow");
    expect(snapshot.scoreBreakdown).toMatchObject({ taskUrgency: expect.any(Number), freeTime: expect.any(Number) });
    expect(snapshot.inputs).toMatchObject({ policyVersion: "context-v1.1.0", localTimeBucket: "afternoon" });
    expect(await database.select().from(conversationMessages).where(eq(conversationMessages.userId, user.id))).toHaveLength(0);

    await database.insert(interventions).values({
      userId: user.id,
      taskId: snapshot.taskId,
      contextSnapshotId: snapshot.id,
      style: "direct_nudge",
      status: "delivered",
      idempotencyKey: `test-intervention:${user.id}`,
    });
    const blocked = await evaluateUserContext({
      userId: user.id,
      repository,
      shadowMode: false,
      now: new Date("2026-08-18T14:30:00Z"),
    });
    expect(blocked.evaluated).toBe(true);
    if (!blocked.evaluated) throw new Error("expected evaluation");
    expect(blocked.evaluation.decision).toBe("blocked");
    expect(blocked.evaluation.reasonCodes).toEqual(expect.arrayContaining(["pending_response", "cooldown_active"]));
  });

  it("persists a reproducible holdout without scheduling delivery", async () => {
    const [user] = await database.insert(users).values({
      phoneE164: "+12025550176", status: "active", onboardingState: "complete", timezone: "UTC",
    }).returning({ id: users.id });
    await database.insert(consentRecords).values({
      userId: user.id, status: "granted", channel: "web", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test",
    });
    await database.insert(tasks).values({
      userId: user.id, title: "Urgent task", dueAt: new Date("2026-08-18T16:00:00Z"), estimatedMinutes: 30,
    });
    await database.insert(calendarConnections).values({
      userId: user.id,
      encryptedRefreshToken: "test-only",
      scopes: ["freebusy"],
      lastSyncedAt: new Date("2026-08-18T14:10:00Z"),
    });
    await database.update(interventionPolicies).set({ holdoutBasisPoints: 10_000 });
    const result = await evaluateUserContext({
      userId: user.id,
      repository: new DrizzleContextEngineRepository(database),
      planner: new DrizzleInterventionRepository(database),
      shadowMode: false,
      now: new Date("2026-08-18T14:15:00Z"),
    });
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error("expected evaluation");
    expect(result.evaluation.decision).toBe("holdout");
    const [intervention] = await database.select().from(interventions).where(eq(interventions.contextSnapshotId, result.snapshotId));
    expect(intervention.status).toBe("held_out");
    expect(await database.select().from(scheduledActions).where(eq(scheduledActions.interventionId, intervention.id))).toHaveLength(0);
  });
});

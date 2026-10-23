import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it, vi } from "vitest";
import type { TempoDatabase } from "../db/client";
import * as schema from "../db/schema";
import { DrizzleMessagingRepository } from "../db/repositories/messaging-repository";
import { PILOT_SYNTHETIC_ADMISSION } from "../../../scripts/pilot-load-config";

const { readEnvironment } = vi.hoisted(() => ({ readEnvironment: vi.fn(() => ({ LOG_LEVEL: "silent", PILOT_ADMISSION_MODE: null, PILOT_INVITED_PHONES: null })) }));
vi.mock("../config/env", () => ({ getServerEnv: readEnvironment }));

it("ingests the synthetic load fixture using its injected admission policy even when ambient admission is closed", async () => {
  const client = new PGlite();
  try {
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
    const database = drizzle(client, { schema }) as unknown as TempoDatabase;
    readEnvironment.mockClear();
    const receipt = await new DrizzleMessagingRepository(database, PILOT_SYNTHETIC_ADMISSION).ingestInbound({
      provider: "test", providerMessageId: "synthetic-load-ingress", from: "+12025550100", to: "+13035550100", body: "START",
    });
    expect(receipt).toEqual({ duplicate: false });
    expect(await database.select().from(schema.users)).toHaveLength(1);
    expect(readEnvironment).not.toHaveBeenCalled();
  } finally { await client.close(); }
});

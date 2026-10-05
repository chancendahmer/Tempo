import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { DrizzleMemoryRepository } from "./memory-repository";
import { MemoryService } from "../../domain/memory-service";

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

it("searches before limiting and excludes other accounts, deleted, expired and sensitive facts", async () => {
  const [owner, outsider] = await database.insert(schema.users).values([{ phoneE164: "+12025550701" }, { phoneE164: "+12025550702" }]).returning();
  await database.insert(schema.memoryEntries).values([
    ...Array.from({ length: 50 }, (_, index) => ({ userId: owner.id, category: "fact" as const, content: `Unrelated fact ${index}`, confidence: 1 })),
    { userId: owner.id, category: "fact", content: "Spare keys are in the blue bowl", confidence: 0.1 },
    { userId: outsider.id, category: "fact", content: "Spare keys FOREIGN PRIVATE", confidence: 1 },
    { userId: owner.id, category: "fact", content: "Spare keys DELETED", deletedAt: new Date() },
    { userId: owner.id, category: "fact", content: "Spare keys EXPIRED", expiresAt: new Date("2020-01-01") },
    { userId: owner.id, category: "fact", content: "Spare keys SENSITIVE", sensitivity: "sensitive" },
  ]);
  const service = new MemoryService(new DrizzleMemoryRepository(database));
  const found = await service.searchRelevant(owner.id, new Date(), "spare keys");
  expect(found.items.map(row => row.content)).toEqual(["Spare keys are in the blue bowl"]);
  expect(found.truncated).toBe(false);
  const broad = await service.searchRelevant(owner.id, new Date());
  expect(broad.items).toHaveLength(20);
  expect(broad.truncated).toBe(true);
  expect(broad.coverage).toContain("More matching");
  expect((await service.searchRelevant(owner.id, new Date(), "%_")).items).toEqual([]);
});

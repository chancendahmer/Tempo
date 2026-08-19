import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { OperationalRepository } from "@/server/db/repositories/operational-repository";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getDatabase();
    await database.execute(sql`select 1`);
    const worker = await new OperationalRepository(database).getHeartbeat("tempo-worker");
    const workerAgeSeconds = worker ? Math.floor((Date.now() - worker.lastSeenAt.getTime()) / 1000) : null;
    const workerHealthy = workerAgeSeconds !== null && workerAgeSeconds < 120;
    return NextResponse.json(
      { ok: workerHealthy, database: "ready", worker: workerHealthy ? "ready" : "stale", workerAgeSeconds },
      { status: workerHealthy ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "readiness check failed");
    return NextResponse.json({ ok: false, database: "unavailable", worker: "unknown" }, { status: 503 });
  }
}

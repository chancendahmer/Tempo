import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { OperationalRepository } from "@/server/db/repositories/operational-repository";
import { logger } from "@/server/observability/logger";
import { queueHealthProblems } from "@/server/domain/queue-health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getDatabase();
    await database.execute(sql`select 1`);
    const worker = await new OperationalRepository(database).getHeartbeat("tempo-worker");
    const workerAgeSeconds = worker ? Math.floor((Date.now() - worker.lastSeenAt.getTime()) / 1000) : null;
    const workerHealthy = workerAgeSeconds !== null && workerAgeSeconds < 120;
    const queue = worker?.metadata.queueHealth;
    const queueKnown = queue && typeof queue === "object" && "blockedAccounts" in queue
      && "ambiguousOutbound" in queue && "pendingInbound" in queue && "oldestPendingSeconds" in queue;
    const queueProblems = queueKnown ? queueHealthProblems(queue as Parameters<typeof queueHealthProblems>[0]) : ["queue_health_unknown"];
    const healthy = workerHealthy && queueProblems.length === 0;
    return NextResponse.json(
      { ok: healthy, database: "ready", worker: workerHealthy ? "ready" : "stale", workerAgeSeconds,
        queue: queueProblems.length ? "degraded" : "ready", queueProblems },
      { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "readiness check failed");
    return NextResponse.json({ ok: false, database: "unavailable", worker: "unknown" }, { status: 503 });
  }
}

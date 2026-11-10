import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { OperationalRepository } from "@/server/db/repositories/operational-repository";
import { logger } from "@/server/observability/logger";
import { getServerEnv } from "@/server/config/env";
import { resolveBuildIdentity, summarizeWorkerAttestations } from "@/server/observability/worker-attestation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getDatabase();
    await database.execute(sql`select 1`);
    const now = new Date();
    const workerAttestation = summarizeWorkerAttestations(await new OperationalRepository(database).getWorkerHeartbeats(), resolveBuildIdentity(getServerEnv()), now);
    const workerHealthy = workerAttestation.ok;
    const workerAgeSeconds = workerAttestation.newestAgeSeconds;
    const queueProblems = workerAttestation.queueProblems;
    const healthy = workerHealthy && queueProblems.length === 0;
    return NextResponse.json(
      { ok: healthy, database: "ready", worker: workerHealthy ? "ready" : workerAttestation.freshInstances ? "unattested" : "stale", workerAgeSeconds,
        queue: queueProblems.length ? "degraded" : "ready", queueProblems, workerAttestation },
      { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "readiness check failed");
    return NextResponse.json({ ok: false, database: "unavailable", worker: "unknown" }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { getServerEnv } from "../../../server/config/env";
import { resolveBuildIdentity } from "../../../server/observability/worker-attestation";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();

  return NextResponse.json(
    {
      ok: true,
      service: "tempo-web",
      configurationScope: "web",
      build: resolveBuildIdentity(env),
      version: packageJson.version,
      environment: env.NODE_ENV,
      shadowMode: env.INTERVENTION_SHADOW_MODE,
      autonomousSendingEnabled: env.AUTONOMOUS_SENDING_ENABLED,
      cleanupCheckinsEnabled: env.CLEANUP_CHECKINS_ENABLED,
      canaryCount: env.PROACTIVE_CANARY_USER_IDS.length,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

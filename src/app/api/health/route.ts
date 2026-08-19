import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { getServerEnv } from "../../../server/config/env";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();

  return NextResponse.json(
    {
      ok: true,
      service: "tempo-web",
      version: packageJson.version,
      environment: env.NODE_ENV,
      shadowMode: env.INTERVENTION_SHADOW_MODE,
      autonomousSendingEnabled: env.AUTONOMOUS_SENDING_ENABLED,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

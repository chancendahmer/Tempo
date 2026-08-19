import { NextRequest, NextResponse } from "next/server";
import { GoogleCalendarProvider } from "@/server/adapters/calendar/google-calendar-provider";
import { requireEnv } from "@/server/config/env";
import { DrizzleCalendarOAuthRepository } from "@/server/db/repositories/calendar-oauth-repository";
import { beginCalendarOAuth } from "@/server/domain/calendar-oauth";
import { InvalidActionTokenError, verifyActionToken } from "@/server/security/action-token";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const env = requireEnv(["DATABASE_URL", "FIELD_ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const action = verifyActionToken(token, "calendar:connect", env.FIELD_ENCRYPTION_KEY!);
    const authorizationUrl = await beginCalendarOAuth({
      userId: action.userId,
      repository: new DrizzleCalendarOAuthRepository(),
      provider: new GoogleCalendarProvider(),
      encryptionKey: env.FIELD_ENCRYPTION_KEY!,
    });
    return NextResponse.redirect(authorizationUrl, 303);
  } catch (error) {
    if (error instanceof InvalidActionTokenError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error({ err: error }, "calendar OAuth start failed");
    return NextResponse.json({ error: "Calendar connection is temporarily unavailable." }, { status: 503 });
  }
}

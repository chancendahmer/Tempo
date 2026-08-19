import { NextRequest, NextResponse } from "next/server";
import { GoogleCalendarProvider } from "@/server/adapters/calendar/google-calendar-provider";
import { requireEnv } from "@/server/config/env";
import { DrizzleCalendarOAuthRepository } from "@/server/db/repositories/calendar-oauth-repository";
import { completeCalendarOAuth } from "@/server/domain/calendar-oauth";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

function homeUrl(baseUrl: string, status: string) {
  const url = new URL("/", baseUrl);
  url.searchParams.set("calendar", status);
  return url;
}

export async function GET(request: NextRequest) {
  const env = requireEnv(["APP_BASE_URL", "DATABASE_URL", "FIELD_ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.has("error") || !state || !code) {
    return NextResponse.redirect(homeUrl(env.APP_BASE_URL, "cancelled"), 303);
  }

  try {
    await completeCalendarOAuth({
      state,
      code,
      repository: new DrizzleCalendarOAuthRepository(),
      provider: new GoogleCalendarProvider(),
      encryptionKey: env.FIELD_ENCRYPTION_KEY!,
    });
    return NextResponse.redirect(homeUrl(env.APP_BASE_URL, "connected"), 303);
  } catch (error) {
    logger.warn({ err: error }, "calendar OAuth callback failed");
    return NextResponse.redirect(homeUrl(env.APP_BASE_URL, "failed"), 303);
  }
}

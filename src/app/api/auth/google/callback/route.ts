import { NextRequest, NextResponse } from "next/server";
import { GoogleCalendarProvider } from "@/server/adapters/calendar/google-calendar-provider";
import { requireEnv } from "@/server/config/env";
import { DrizzleCalendarOAuthRepository } from "@/server/db/repositories/calendar-oauth-repository";
import { completeCalendarOAuth } from "@/server/domain/calendar-oauth";
import { logger } from "@/server/observability/logger";
import { WEB_SESSION_COOKIE, WEB_SESSION_TTL_SECONDS, WebSessionService } from "@/server/security/web-session";

export const dynamic = "force-dynamic";

function extensionUrl(baseUrl: string, status: string) {
  const url = new URL("/extensions", baseUrl);
  url.searchParams.set("calendar", status);
  return url;
}

export async function GET(request: NextRequest) {
  const env = requireEnv(["APP_BASE_URL", "DATABASE_URL", "FIELD_ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.has("error") || !state || !code) {
    return NextResponse.redirect(extensionUrl(env.APP_BASE_URL, "cancelled"), 303);
  }

  try {
    const completed = await completeCalendarOAuth({
      state,
      code,
      repository: new DrizzleCalendarOAuthRepository(),
      provider: new GoogleCalendarProvider(),
      encryptionKey: env.FIELD_ENCRYPTION_KEY!,
    });
    const session = await new WebSessionService().create(completed.userId, new Date(), true);
    const response = NextResponse.redirect(extensionUrl(env.APP_BASE_URL, "connected"), 303);
    response.cookies.set(WEB_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: WEB_SESSION_TTL_SECONDS,
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    logger.warn({ err: error }, "calendar OAuth callback failed");
    return NextResponse.redirect(extensionUrl(env.APP_BASE_URL, "failed"), 303);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/server/config/env";
import { createSecureActionLinks } from "@/server/security/action-links";
import { WEB_SESSION_COOKIE, WebSessionService, accountCacheKey } from "@/server/security/web-session";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const account = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Log in to manage extensions." }, { status: 401, headers });
    const env = requireEnv(["APP_BASE_URL", "FIELD_ENCRYPTION_KEY"]);
    const links = createSecureActionLinks(env.APP_BASE_URL, env.FIELD_ENCRYPTION_KEY!);
    return NextResponse.json({
      cacheKey: accountCacheKey(account.userId),
      calendar: {
        status: account.calendarStatus ?? "disconnected",
        connectUrl: links.calendarConnect(account.userId),
        disconnectUrl: account.calendarStatus === "active" ? links.calendarDisconnect(account.userId) : null,
      },
    }, { headers });
  } catch {
    logger.error({ operation: "read_account_extensions" }, "extension lookup unavailable");
    return NextResponse.json({ error: "Your connections are temporarily unavailable. Please try again shortly." }, { status: 503, headers });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/server/config/env";
import { createSecureActionLinks } from "@/server/security/action-links";
import { WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const account = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
  if (!account?.phoneVerified) return NextResponse.json({ error: "Log in to manage extensions." }, { status: 401 });
  const env = requireEnv(["APP_BASE_URL", "FIELD_ENCRYPTION_KEY"]);
  const links = createSecureActionLinks(env.APP_BASE_URL, env.FIELD_ENCRYPTION_KEY!);
  return NextResponse.json({
    calendar: {
      status: account.calendarStatus ?? "disconnected",
      connectUrl: links.calendarConnect(account.userId),
      disconnectUrl: account.calendarStatus === "active" ? links.calendarDisconnect(account.userId) : null,
    },
  }, { headers: { "cache-control": "no-store" } });
}

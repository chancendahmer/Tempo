import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/server/config/env";
import { isTrustedMutationOrigin, sessionBindingKey, WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";
import { logger } from "@/server/observability/logger";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  try {
    if (!isTrustedMutationOrigin(request.headers.get("origin"), getServerEnv().APP_BASE_URL)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    }
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value;
    // Pending sessions get an opaque session proof, never an account cache identity.
    // Expired/absent sessions can still be cleared idempotently; never revoke a
    // newly current active session on a stale or missing observed precondition.
    if (token) {
      const sessions = new WebSessionService();
      if (request.headers.get("x-tempo-session") !== sessionBindingKey(token)) {
        if (await sessions.findAccount(token)) return NextResponse.json({ code: "session_changed", error: "Your sign-in changed. Refresh and check your account before signing out." }, { status: 409, headers });
      }
      await sessions.revoke(token);
    }
    const response = NextResponse.json({ loggedOut: true }, { headers });
    response.cookies.set(WEB_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch {
    logger.error({ operation: "revoke_web_session" }, "logout unavailable");
    return NextResponse.json({ error: "Sign-out could not be confirmed. Please try again shortly." }, { status: 503, headers });
  }
}

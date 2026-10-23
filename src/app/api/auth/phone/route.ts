import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "../../../../server/config/env";
import { InvalidActionTokenError, verifyActionToken } from "../../../../server/security/action-token";
import { WEB_SESSION_COOKIE, WEB_SESSION_TTL_SECONDS, WebSessionService } from "../../../../server/security/web-session";
import { logger } from "../../../../server/observability/logger";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };
const htmlHeaders = { ...headers, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };

// Static recovery content never reflects an incoming token, URL or provider error.
function recovery(status: 400 | 503) {
  const title = status === 400 ? "Let's get you a new link." : "Give us a moment.";
  const detail = status === 400
    ? "This sign-in link has expired or was already used. Request another link to continue."
    : "Sign-in is temporarily unavailable. Your account is unchanged. Return to sign in and try again shortly.";
  return new NextResponse(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to Tempo</title><style>body{margin:0;background:#f5f4ed;color:#253b36;font-family:system-ui;line-height:1.5}main{box-sizing:border-box;width:calc(100% - 32px);max-width:440px;margin:12vh auto;padding:32px;background:white;border:1px solid #dddeda;border-radius:24px}h1{line-height:1.2;font-size:28px}a{display:block;margin-top:20px;padding:14px 20px;border-radius:24px;background:#294d43;color:white;text-align:center;text-decoration:none}a:focus-visible{outline:3px solid #a75b28;outline-offset:4px}</style></head><body><main><p>TEMPO</p><h1>${title}</h1><p>${detail}</p><a href="/login">Back to sign in</a></main></body></html>`, { status, headers: htmlHeaders });
}

function failure() {
  return recovery(400);
}
function unavailable() {
  return recovery(503);
}

// GET is intentionally read-only: messaging apps may preview links automatically.
export async function GET(request: NextRequest) {
  try {
    const env = requireEnv(["FIELD_ENCRYPTION_KEY"]);
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const action = verifyActionToken(token, "account:signin", env.FIELD_ENCRYPTION_KEY!);
    if (!action.sessionId) return failure();
    // Verified tokens contain only base64url characters and a dot.
    return new NextResponse(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to Tempo</title><body style="margin:0;background:#f5f4ed;color:#253b36;font-family:system-ui"><main style="max-width:400px;margin:15vh auto;padding:32px;background:white;border-radius:24px"><p>TEMPO</p><h1>Your space is ready.</h1><p>Confirm to open your dashboard and approve the browser where you requested this link. Only continue if you requested this sign-in.</p><form method="post"><input type="hidden" name="token" value="${token}"><button style="padding:16px 24px;background:#294d43;color:white;border:0;border-radius:16px;font:inherit">Open my dashboard</button></form><p style="font-size:14px">This link expires after 15 minutes and can be used once.</p></main></body></html>`, {
      headers: htmlHeaders,
    });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) return failure();
    logger.error({ operation: "preview_phone_signin" }, "phone sign-in unavailable");
    return unavailable();
  }
}

export async function POST(request: NextRequest) {
  try {
    const env = requireEnv(["FIELD_ENCRYPTION_KEY", "DATABASE_URL", "APP_BASE_URL"]);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(env.APP_BASE_URL).origin) return failure();
    const form = await request.formData();
    const session = await new WebSessionService().redeemSignIn(String(form.get("token") ?? ""), env.FIELD_ENCRYPTION_KEY!);
    const response = NextResponse.redirect(new URL("/workspace", env.APP_BASE_URL), 303);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    response.cookies.set(WEB_SESSION_COOKIE, session.token, {
      httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/",
      maxAge: WEB_SESSION_TTL_SECONDS, expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    if (error instanceof InvalidActionTokenError) return failure();
    logger.error({ operation: "redeem_phone_signin" }, "phone sign-in unavailable");
    return unavailable();
  }
}

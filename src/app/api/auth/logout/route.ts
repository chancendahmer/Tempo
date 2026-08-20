import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/server/config/env";
import { isTrustedMutationOrigin, WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";

export async function POST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request.headers.get("origin"), getServerEnv().APP_BASE_URL)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  await new WebSessionService().revoke(request.cookies.get(WEB_SESSION_COOKIE)?.value);
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(WEB_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

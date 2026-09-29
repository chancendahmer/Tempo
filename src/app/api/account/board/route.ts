import { NextRequest, NextResponse } from "next/server";
import { readBoard } from "@/server/db/repositories/board-repository";
import { logger } from "@/server/observability/logger";
import { WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Log in to open your board." }, { status: 401, headers });
    const account = await new WebSessionService().findAccount(token);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Log in to open your board." }, { status: 401, headers });
    return NextResponse.json(await readBoard(account.userId), { headers });
  } catch (error) {
    logger.error({ err: error }, "board lookup failed");
    return NextResponse.json({ error: "Your board is temporarily unavailable." }, { status: 503, headers });
  }
}

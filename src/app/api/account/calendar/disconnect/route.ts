import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/server/config/env";
import { DrizzleAccountControlRepository } from "@/server/db/repositories/account-control-repository";
import { disconnectCalendar } from "@/server/domain/account-controls";
import { InvalidActionTokenError, verifyActionToken } from "@/server/security/action-token";

export const dynamic = "force-dynamic";

function verify(token: string) {
  const env = requireEnv(["DATABASE_URL", "FIELD_ENCRYPTION_KEY"]);
  return verifyActionToken(token, "calendar:disconnect", env.FIELD_ENCRYPTION_KEY!);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    verify(token);
    const action = request.nextUrl.pathname;
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:38rem;margin:5rem auto;padding:1.5rem"><h1>Disconnect Google Calendar?</h1><p>Tempo will delete its cached busy windows and stored Google tokens. Your Google events are not changed.</p><form method="post" action="${action}"><input type="hidden" name="token" value="${token}"><button style="padding:.8rem 1.1rem;border:0;border-radius:999px;background:#111;color:#fff">Disconnect calendar</button></form></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof InvalidActionTokenError ? 401 : 503;
    return NextResponse.json({ error: status === 401 ? "This secure link is invalid or has expired." : "Unavailable." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const action = verify(String(form.get("token") ?? ""));
    await disconnectCalendar(new DrizzleAccountControlRepository(), action.userId);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const status = error instanceof InvalidActionTokenError ? 401 : 503;
    return NextResponse.json({ error: status === 401 ? "This secure link is invalid or has expired." : "Unavailable." }, { status });
  }
}

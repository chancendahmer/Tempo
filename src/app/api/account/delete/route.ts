import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/server/config/env";
import { DrizzleAccountControlRepository } from "@/server/db/repositories/account-control-repository";
import { deleteAccount } from "@/server/domain/account-controls";
import { InvalidActionTokenError, verifyActionToken } from "@/server/security/action-token";

export const dynamic = "force-dynamic";

function verify(token: string) {
  const env = requireEnv(["DATABASE_URL", "FIELD_ENCRYPTION_KEY"]);
  return verifyActionToken(token, "account:delete", env.FIELD_ENCRYPTION_KEY!);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    verify(token);
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:38rem;margin:5rem auto;padding:1.5rem"><h1>Permanently delete Tempo?</h1><p>This deletes your tasks, messages, calendar tokens, cached availability, coaching history, and consent-linked account data. This cannot be undone.</p><form method="post"><input type="hidden" name="token" value="${token}"><label>Type DELETE<br><input required name="confirmation" autocomplete="off" style="padding:.7rem;margin:.7rem 0"></label><br><button style="padding:.8rem 1.1rem;border:0;border-radius:999px;background:#b42318;color:#fff">Delete everything</button></form></body></html>`,
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
    await deleteAccount(new DrizzleAccountControlRepository(), {
      userId: action.userId,
      confirmation: String(form.get("confirmation") ?? ""),
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = error instanceof InvalidActionTokenError ? 401 : error instanceof Error && error.message.startsWith("Type DELETE") ? 400 : 503;
    return NextResponse.json({ error: status === 401 ? "This secure link is invalid or has expired." : status === 400 ? "Type DELETE to confirm." : "Unavailable." }, { status });
  }
}

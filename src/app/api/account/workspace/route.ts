import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WebSessionService, accountCacheKey, WEB_SESSION_COOKIE, isTrustedMutationOrigin } from "@/server/security/web-session";
import { getServerEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { mutateWorkspace, readWorkspace, workspaceActionSchema, WorkspaceConflict } from "@/server/db/repositories/workspace-repository";
import { OperationalRepository } from "@/server/db/repositories/operational-repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: NextRequest, write: boolean) {
  try {
    if (write && !isTrustedMutationOrigin(request.headers.get("origin"), getServerEnv().APP_BASE_URL)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Please log in to your workspace." }, { status: 401, headers });
    const account = await new WebSessionService().findAccount(token);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Please verify your phone to open your workspace." }, { status: 401, headers });
    const cacheKey = accountCacheKey(account.userId);
    if (!write) {
      const diaryDate = z.iso.date().optional().parse(request.nextUrl.searchParams.get("date") ?? undefined);
      const workspace = await readWorkspace(account.userId, undefined, { diaryDate });
      return NextResponse.json({ ...workspace, cacheKey, profile: { ...workspace.profile, phoneLast4: account.phoneLast4 } }, { headers });
    }
    if (request.headers.get("x-tempo-account") !== cacheKey) return NextResponse.json({ error: "Your account changed. Reopen this form before saving.", code: "account_changed" }, { status: 409, headers });
    const limit = await new OperationalRepository().consumeRateLimit({ key: `workspace-write:${account.userId}`, limit: 30, windowMs: 60000 });
    if (!limit.allowed) return NextResponse.json({ error: "A lot changed at once. Please try again in a minute." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
    if (Number(request.headers.get("content-length") ?? 0) > 32000) return NextResponse.json({ error: "This request is too large." }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 32000) return NextResponse.json({ error: "This request is too large." }, { status: 413, headers });
    return NextResponse.json({ ...await mutateWorkspace(account.userId, workspaceActionSchema.parse(JSON.parse(raw))), cacheKey }, { headers });
  } catch (error) {
    if (error instanceof WorkspaceConflict) return NextResponse.json({ error: error.message }, { status: 409, headers });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check the entered values and try again." }, { status: 400, headers });
    // Driver errors can retain SQL, bound session hashes and account content.
    logger.error({ operation: write ? "mutate_workspace" : "read_workspace" }, "workspace request failed");
    return NextResponse.json({ error: "Your workspace is unavailable. Please try again shortly." }, { status: 503, headers });
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);

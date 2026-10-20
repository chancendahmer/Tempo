import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { WEB_SESSION_COOKIE, WebSessionService, isTrustedMutationOrigin } from "@/server/security/web-session";
import { readGentleSetup, saveGentleSetup, SetupAccountUnavailable } from "@/server/db/repositories/gentle-setup-repository";
import { OperationalRepository } from "@/server/db/repositories/operational-repository";
import { gentleSetupActionSchema } from "@/server/domain/gentle-setup";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function handle(request: NextRequest, write: boolean) {
  try {
    if (write && !isTrustedMutationOrigin(request.headers.get("origin"), getServerEnv().APP_BASE_URL)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    const account = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Log in to personalize your workspace." }, { status: 401, headers });
    if (!write) return NextResponse.json({ setup: await readGentleSetup(account.userId) }, { headers });
    const limit = await new OperationalRepository().consumeRateLimit({ key: `setup-write:${account.userId}`, limit: 30, windowMs: 60000 });
    if (!limit.allowed) return NextResponse.json({ error: "Please try again in a minute." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
    if (Number(request.headers.get("content-length") ?? 0) > 2048) return NextResponse.json({ error: "This request is too large." }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 2048) return NextResponse.json({ error: "This request is too large." }, { status: 413, headers });
    return NextResponse.json({ setup: await saveGentleSetup(account.userId, gentleSetupActionSchema.parse(JSON.parse(raw))) }, { headers });
  } catch (error) {
    if (error instanceof SetupAccountUnavailable) return NextResponse.json({ error: error.message }, { status: 404, headers });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check your choices and try again." }, { status: 400, headers });
    logger.error({ err: error }, "workspace setup request failed");
    return NextResponse.json({ error: "Your choices could not be saved. Please try again shortly." }, { status: 503, headers });
  }
}

export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);

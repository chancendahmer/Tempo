import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEnv } from "../../../../server/config/env";
import { FeedbackAccountUnavailable, FeedbackConflict, FeedbackRateLimited, pilotFeedbackSchema } from "../../../../server/domain/pilot-feedback";
import { PilotFeedbackRepository } from "../../../../server/db/repositories/pilot-feedback-repository";
import { accountCacheKey, WEB_SESSION_COOKIE, WebSessionService, isTrustedMutationOrigin } from "../../../../server/security/web-session";
import { logger } from "../../../../server/observability/logger";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  try {
    const env = requireEnv(["FIELD_ENCRYPTION_KEY"]);
    if (!isTrustedMutationOrigin(request.headers.get("origin"), env.APP_BASE_URL)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    const account = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Log in to send feedback." }, { status: 401, headers });
    const cacheKey = accountCacheKey(account.userId);
    if (request.headers.get("x-tempo-account") !== cacheKey) return NextResponse.json({ error: "Your account changed. Reopen this form before saving.", code: "account_changed" }, { status: 409, headers });
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return NextResponse.json({ error: "This report is too large." }, { status: 413, headers });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return NextResponse.json({ error: "This report is too large." }, { status: 413, headers });
    const input = pilotFeedbackSchema.parse(JSON.parse(raw));
    const receipt = await new PilotFeedbackRepository().submit(account.userId, input, env.FIELD_ENCRYPTION_KEY!);
    return NextResponse.json({ receipt, cacheKey }, { status: 201, headers });
  } catch (error) {
    if (error instanceof FeedbackAccountUnavailable) return NextResponse.json({ error: "Your account is unavailable. Sign in again." }, { status: 401, headers });
    if (error instanceof FeedbackConflict) return NextResponse.json({ error: error.message }, { status: 409, headers });
    if (error instanceof FeedbackRateLimited) return NextResponse.json({ error: error.message }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfterSeconds) } });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check the report fields and try again." }, { status: 400, headers });
    // Do not log errors that could retain request bodies, SQL parameters or detail.
    logger.error({ operation: "submit_feedback" }, "feedback submission unavailable");
    return NextResponse.json({ error: "Your report could not be confirmed. Please retry with the same details." }, { status: 503, headers });
  }
}

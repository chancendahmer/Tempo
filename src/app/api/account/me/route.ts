import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/server/observability/logger";
import { getServerEnv } from "@/server/config/env";
import { isTrustedMutationOrigin, publicAccount, accountCacheKey, sessionBindingKey, WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Add a name.").max(80),
  profileInstructions: z.string().trim().max(2_000).optional(),
  expectedCacheKey: z.string().max(64).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value;
    const account = await new WebSessionService().findAccount(token);
    return NextResponse.json(
      account && token ? { account: publicAccount(account), sessionKey: sessionBindingKey(token) } : { account: null, sessionKey: null },
      { headers },
    );
  } catch {
    logger.error({ operation: "read_web_account" }, "web account lookup failed");
    return NextResponse.json({ account: null, error: "Account status is temporarily unavailable." }, { status: 503, headers });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isTrustedMutationOrigin(request.headers.get("origin"), getServerEnv().APP_BASE_URL)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    }
    const account = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Log in to update your profile." }, { status: 401, headers });
    const input = profileSchema.parse(await request.json());
    // This is an optimistic ownership precondition, never an authentication credential.
    if (input.expectedCacheKey !== accountCacheKey(account.userId)) return NextResponse.json({ error: "Refresh your profile to confirm the signed-in account before saving. Your changes were not saved." }, { status: 409, headers });
    await new WebSessionService().updateProfile(account.userId, {
      displayName: input.displayName,
      profileInstructions: input.profileInstructions || null,
    });
    const updated = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    return NextResponse.json({ account: updated ? publicAccount(updated) : null }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Check your profile details and try again." }, { status: 400, headers });
    }
    logger.error({ operation: "update_web_profile" }, "profile update failed");
    return NextResponse.json({ error: "Profile update is temporarily unavailable." }, { status: 503, headers });
  }
}

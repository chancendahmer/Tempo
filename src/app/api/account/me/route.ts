import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/server/observability/logger";
import { getServerEnv } from "@/server/config/env";
import { isTrustedMutationOrigin, publicAccount, WEB_SESSION_COOKIE, WebSessionService } from "@/server/security/web-session";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Add a name.").max(80),
  profileInstructions: z.string().trim().max(2_000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const account = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    return NextResponse.json(
      account ? { account: publicAccount(account) } : { account: null },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "web account lookup failed");
    return NextResponse.json({ account: null, error: "Account status is temporarily unavailable." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isTrustedMutationOrigin(request.headers.get("origin"), getServerEnv().APP_BASE_URL)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const account = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    if (!account?.phoneVerified) return NextResponse.json({ error: "Log in to update your profile." }, { status: 401 });
    const input = profileSchema.parse(await request.json());
    await new WebSessionService().updateProfile(account.userId, {
      displayName: input.displayName,
      profileInstructions: input.profileInstructions || null,
    });
    const updated = await new WebSessionService().findAccount(request.cookies.get(WEB_SESSION_COOKIE)?.value);
    return NextResponse.json({ account: updated ? publicAccount(updated) : null });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Check your profile details and try again." }, { status: 400 });
    }
    logger.error({ err: error }, "profile update failed");
    return NextResponse.json({ error: "Profile update is temporarily unavailable." }, { status: 503 });
  }
}

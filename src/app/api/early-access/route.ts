import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireEnv } from "@/server/config/env";
import { DrizzleConsentRepository } from "@/server/db/repositories/consent-repository";
import { InvalidPhoneNumberError, phonePartsToE164 } from "@/server/domain/phone";
import { hashAuditValue, recordWebConsent, webConsentInputSchema } from "@/server/domain/consent";
import { logger } from "@/server/observability/logger";
import { OperationalRepository } from "@/server/db/repositories/operational-repository";
import { LinqOnboardingService } from "@/server/adapters/sms/linq-onboarding";
import { SendblueOnboardingService } from "@/server/adapters/sms/sendblue-onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireEnv(["DATABASE_URL"]);
    const count = await new OperationalRepository().countEarlyAccess();
    return NextResponse.json(
      { count },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    logger.error({ err: error }, "early access count failed");
    return NextResponse.json({ count: 0 }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const env = requireEnv(["DATABASE_URL", "FIELD_ENCRYPTION_KEY"]);
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const rateLimitKey = hashAuditValue(forwardedFor ?? request.headers.get("user-agent") ?? "unknown", env.FIELD_ENCRYPTION_KEY!)!;
    const rateLimit = await new OperationalRepository().consumeRateLimit({
      key: `early-access:${rateLimitKey}`,
      limit: 10,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Try again shortly." },
        { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
      );
    }
    const body: unknown = await request.json();
    const parsedInput = webConsentInputSchema.parse(body);
    const phoneE164 = phonePartsToE164(parsedInput);
    const sendblueOnboarding = env.MESSAGING_PROVIDER === "sendblue" ? new SendblueOnboardingService() : undefined;
    const onboarding = sendblueOnboarding
      ? await sendblueOnboarding.prepareContact(phoneE164)
      : env.MESSAGING_PROVIDER === "linq"
        ? await new LinqOnboardingService().assignLine(phoneE164)
        : undefined;

    await recordWebConsent(new DrizzleConsentRepository(), body, {
      ip: forwardedFor,
      userAgent: request.headers.get("user-agent") ?? undefined,
      auditKey: env.FIELD_ENCRYPTION_KEY!,
      onboardingFlow: onboarding && !("verified" in onboarding && onboarding.verified) ? "user_first" : "tempo_first",
    });

    let verificationSent = false;
    if (sendblueOnboarding && onboarding && "verified" in onboarding && !onboarding.verified) {
      try {
        await sendblueOnboarding.requestVerification(phoneE164);
        verificationSent = true;
      } catch (error) {
        logger.warn({ err: error }, "Sendblue verification message failed; returning manual-text fallback");
      }
    }

    return NextResponse.json({
      accepted: true,
      ...(onboarding ? {
        onboarding: {
          phoneNumber: onboarding.phoneNumber,
          messageHref: `sms:${onboarding.phoneNumber}?body=START`,
          ...(env.MESSAGING_PROVIDER === "sendblue" && "verified" in onboarding
            ? { verificationSent, alreadyVerified: onboarding.verified }
            : {}),
          ...(env.MESSAGING_PROVIDER === "linq" && "vcfUrl" in onboarding ? { vcfUrl: onboarding.vcfUrl } : {}),
        },
      } : {}),
    }, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof InvalidPhoneNumberError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof InvalidPhoneNumberError ? error.message : "Check the phone number and consent, then try again." },
        { status: 400 },
      );
    }

    logger.error({ err: error }, "early access consent submission failed");
    return NextResponse.json({ error: "Early access signup is temporarily unavailable." }, { status: 503 });
  }
}

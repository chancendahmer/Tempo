import { createHmac } from "node:crypto";
import { z } from "zod";
import { phonePartsToE164 } from "./phone";

export const SMS_DISCLOSURE_VERSION = "2026-08-18.v1";
export const TERMS_VERSION = "2026-08-18.v1";
export const PRIVACY_VERSION = "2026-08-18.v1";

const SUPPORTED_CALLING_CODES: Record<string, string> = { US: "+1", CA: "+1", GB: "+44", AU: "+61" };

export const webConsentInputSchema = z.object({
  countryCode: z.string().trim().length(2),
  callingCode: z.string().trim().regex(/^\+\d{1,3}$/),
  areaCode: z.string().trim().regex(/^\d{1,4}$/),
  subscriberNumber: z.string().trim().min(4).max(20),
  consent: z.literal(true),
}).superRefine((input, context) => {
  const expected = SUPPORTED_CALLING_CODES[input.countryCode.toUpperCase()];
  if (!expected || input.callingCode !== expected) {
    context.addIssue({
      code: "custom",
      path: ["callingCode"],
      message: "Country and calling code do not match a supported signup region.",
    });
  }
});

export type WebConsentInput = z.infer<typeof webConsentInputSchema>;

export type ConsentEvidence = {
  phoneE164: string;
  disclosureVersion: string;
  termsVersion: string;
  privacyVersion: string;
  sourceIpHash?: string;
  userAgent?: string;
  evidence: {
    submittedCountry: string;
    submittedCallingCode: string;
    submittedAreaCode: string;
    onboardingFlow: "tempo_first" | "user_first";
  };
  scheduleInitialMessages: boolean;
};

export interface ConsentRepository {
  grantWebConsent(input: ConsentEvidence): Promise<{ userId: string }>;
}

export function hashAuditValue(value: string | undefined, auditKey: string): string | undefined {
  if (!value) return undefined;
  return createHmac("sha256", auditKey).update(value).digest("hex");
}

export async function recordWebConsent(
  repository: ConsentRepository,
  rawInput: unknown,
  metadata: {
    ip?: string;
    userAgent?: string;
    auditKey: string;
    onboardingFlow?: "tempo_first" | "user_first";
  },
) {
  const input = webConsentInputSchema.parse(rawInput);
  const phoneE164 = phonePartsToE164(input);

  return repository.grantWebConsent({
    phoneE164,
    disclosureVersion: SMS_DISCLOSURE_VERSION,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    sourceIpHash: hashAuditValue(metadata.ip, metadata.auditKey),
    userAgent: metadata.userAgent?.slice(0, 500),
    evidence: {
      submittedCountry: input.countryCode.toUpperCase(),
      submittedCallingCode: input.callingCode,
      submittedAreaCode: input.areaCode,
      onboardingFlow: metadata.onboardingFlow ?? "tempo_first",
    },
    scheduleInitialMessages: metadata.onboardingFlow !== "user_first",
  });
}

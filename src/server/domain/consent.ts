import { createHmac } from "node:crypto";
import { z } from "zod";
import { phonePartsToE164, signupCallingCode, signupPhoneToE164 } from "./phone";

export const SMS_DISCLOSURE_VERSION = "2026-08-18.v1";
export const TERMS_VERSION = "2026-08-18.v1";
export const PRIVACY_VERSION = "2026-11-10.v2";

const webConsentFields = z.object({
  countryCode: z.string().trim().length(2),
  consent: z.literal(true),
});

const splitPhoneConsentSchema = webConsentFields.extend({
  callingCode: z.string().trim().regex(/^\+\d{1,3}$/),
  areaCode: z.string().trim().regex(/^\d{1,4}$/),
  subscriberNumber: z.string().trim().min(4).max(20),
  phoneNumber: z.never().optional(),
}).superRefine((input, context) => {
  if (input.callingCode !== signupCallingCode(input.countryCode)) {
    context.addIssue({
      code: "custom",
      path: ["callingCode"],
      message: "Country and calling code do not match a supported signup region.",
    });
  }
});

export const webConsentInputSchema = z.union([
  webConsentFields.extend({ phoneNumber: z.string().trim().min(1).max(250) }),
  splitPhoneConsentSchema,
]);

export type WebConsentInput = z.infer<typeof webConsentInputSchema>;

export function webConsentPhoneToE164(input: WebConsentInput): string {
  return input.phoneNumber === undefined ? phonePartsToE164(input) : signupPhoneToE164(input);
}

export type ConsentEvidence = {
  phoneE164: string;
  disclosureVersion: string;
  termsVersion: string;
  privacyVersion: string;
  sourceIpHash?: string;
  userAgent?: string;
  evidence: {
    submittedCountry: string;
    submittedCallingCode?: string;
    submittedAreaCode?: string;
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
  const phoneE164 = webConsentPhoneToE164(input);
  const countryCode = input.countryCode.toUpperCase();

  return repository.grantWebConsent({
    phoneE164,
    disclosureVersion: SMS_DISCLOSURE_VERSION,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    sourceIpHash: hashAuditValue(metadata.ip, metadata.auditKey),
    userAgent: metadata.userAgent?.slice(0, 500),
    evidence: {
      submittedCountry: countryCode,
      submittedCallingCode: signupCallingCode(countryCode),
      ...(input.phoneNumber === undefined && { submittedAreaCode: input.areaCode }),
      onboardingFlow: metadata.onboardingFlow ?? "tempo_first",
    },
    scheduleInitialMessages: metadata.onboardingFlow !== "user_first",
  });
}

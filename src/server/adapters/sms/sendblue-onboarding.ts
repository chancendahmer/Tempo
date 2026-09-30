import { z } from "zod";
import { requireEnv } from "../../config/env";
import { normalizeE164 } from "../../domain/phone";
import { SendblueApiError } from "./sendblue-transport";

const sendblueContactResponseSchema = z.object({
  status: z.literal("OK"),
  contact: z.object({
    phone: z.string(),
    sendblue_number: z.string(),
    verified: z.boolean(),
  }).passthrough(),
}).passthrough();
const sharedContactResponseSchema = z.object({
  status: z.literal("OK").optional(),
  data: z.object({
    contact: z.object({ phone_number: z.string(), verification_status: z.enum(["pending", "verified"]), verified: z.boolean() }),
    line: z.object({ phone_number: z.string(), type: z.literal("shared") }),
  }),
});

function providerPhone(value: string) {
  try { return normalizeE164(value); }
  catch { throw new SendblueApiError("Sendblue returned an invalid contact route", 502); }
}

export type SendblueOnboardingAssignment = {
  phoneNumber: string;
  verified: boolean;
  verificationMethod: "inbound" | "provider_message";
};

export class SendblueOnboardingService {
  constructor(private readonly request: typeof fetch = fetch) {}

  async prepareContact(recipient: string): Promise<SendblueOnboardingAssignment> {
    const env = requireEnv([
      "SENDBLUE_API_KEY",
      "SENDBLUE_API_SECRET",
      "SENDBLUE_PHONE_NUMBER",
    ]);
    const normalizedRecipient = normalizeE164(recipient);
    const shared = env.SENDBLUE_ONBOARDING_MODE === "shared";
    const configuredLine = normalizeE164(env.SENDBLUE_PHONE_NUMBER!);
    const response = await this.request(`${env.SENDBLUE_API_BASE_URL}${shared ? "/v3/verified-contacts" : "/api/v2/contacts"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": env.SENDBLUE_API_KEY!,
        "sb-api-secret-key": env.SENDBLUE_API_SECRET!,
      },
      body: JSON.stringify(shared ? { phone_number: normalizedRecipient } : {
        number: normalizedRecipient,
        sendblue_number: configuredLine,
        tags: ["tempo-sandbox-demo"],
        update_if_exists: true,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new SendblueApiError(`Sendblue contact setup failed with HTTP ${response.status}`, response.status);
    }
    if (shared) {
      const result = sharedContactResponseSchema.safeParse(payload);
      if (!result.success) throw new SendblueApiError("Sendblue returned an invalid shared contact response", 502);
      const { contact, line } = result.data.data;
      if (providerPhone(contact.phone_number) !== normalizedRecipient || contact.verified !== (contact.verification_status === "verified") || providerPhone(line.phone_number) !== configuredLine) {
        throw new SendblueApiError("Sendblue returned an inconsistent shared contact response", 502);
      }
      return { phoneNumber: providerPhone(line.phone_number), verified: contact.verified, verificationMethod: "inbound" };
    }
    const result = sendblueContactResponseSchema.safeParse(payload);
    if (!result.success) throw new SendblueApiError("Sendblue returned an invalid dedicated contact response", 502);
    const { contact } = result.data;
    if (providerPhone(contact.phone) !== normalizedRecipient || providerPhone(contact.sendblue_number) !== configuredLine) {
      throw new SendblueApiError("Sendblue returned an inconsistent dedicated contact response", 502);
    }
    return { phoneNumber: providerPhone(contact.sendblue_number), verified: contact.verified, verificationMethod: "provider_message" };
  }

  async requestVerification(recipient: string): Promise<void> {
    const env = requireEnv(["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET"]);
    if (env.SENDBLUE_ONBOARDING_MODE !== "dedicated") throw new SendblueApiError("Shared contact verification requires an inbound message", 409);
    const response = await this.request(`${env.SENDBLUE_API_BASE_URL}/api/v2/contacts/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": env.SENDBLUE_API_KEY!,
        "sb-api-secret-key": env.SENDBLUE_API_SECRET!,
      },
      body: JSON.stringify({ number: normalizeE164(recipient) }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new SendblueApiError(`Sendblue contact verification failed with HTTP ${response.status}`, response.status);
    }
    if (!z.object({ status: z.literal("OK") }).safeParse(payload).success) {
      throw new SendblueApiError("Sendblue rejected the verification request", 502);
    }
  }
}

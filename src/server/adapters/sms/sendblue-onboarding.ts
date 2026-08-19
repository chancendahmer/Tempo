import { z } from "zod";
import { requireEnv } from "../../config/env";
import { normalizeE164 } from "../../domain/phone";
import { SendblueApiError } from "./sendblue-transport";

const sendblueContactResponseSchema = z.object({
  status: z.string().optional(),
  contact: z.object({
    phone: z.string().optional(),
    sendblue_number: z.string().optional(),
    verified: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough();

export type SendblueOnboardingAssignment = {
  phoneNumber: string;
  verified: boolean;
};

export class SendblueOnboardingService {
  constructor(private readonly request: typeof fetch = fetch) {}

  async prepareContact(recipient: string): Promise<SendblueOnboardingAssignment> {
    const env = requireEnv([
      "SENDBLUE_API_KEY",
      "SENDBLUE_API_SECRET",
      "SENDBLUE_PHONE_NUMBER",
    ]);
    const phoneNumber = normalizeE164(env.SENDBLUE_PHONE_NUMBER!);
    const normalizedRecipient = normalizeE164(recipient);
    const response = await this.request(`${env.SENDBLUE_API_BASE_URL}/api/v2/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": env.SENDBLUE_API_KEY!,
        "sb-api-secret-key": env.SENDBLUE_API_SECRET!,
      },
      body: JSON.stringify({
        number: normalizedRecipient,
        sendblue_number: phoneNumber,
        tags: ["tempo-sandbox-demo"],
        update_if_exists: true,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new SendblueApiError(`Sendblue contact setup failed with HTTP ${response.status}`, response.status);
    }
    const contact = sendblueContactResponseSchema.parse(payload).contact;
    return { phoneNumber, verified: contact?.verified ?? false };
  }

  async requestVerification(recipient: string): Promise<void> {
    const env = requireEnv(["SENDBLUE_API_KEY", "SENDBLUE_API_SECRET"]);
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
    z.object({ status: z.string().optional() }).passthrough().parse(payload);
  }
}

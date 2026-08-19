import { z } from "zod";
import { requireEnv } from "../../config/env";
import { normalizeE164 } from "../../domain/phone";
import { MessagingTransport, SendMessageInput } from "./sms-transport";

const sendblueSendResponseSchema = z.object({
  message_handle: z.string().min(1),
  status: z.string().min(1),
  service: z.enum(["iMessage", "RCS", "SMS"]).optional(),
}).passthrough();

const sendblueErrorSchema = z.object({
  error_code: z.union([z.number(), z.string()]).nullish(),
  message: z.string().optional(),
  error_message: z.string().optional(),
}).passthrough();

export class SendblueApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SendblueApiError";
  }
}

export class SendblueMessagingTransport implements MessagingTransport {
  constructor(private readonly request: typeof fetch = fetch) {}

  async send(input: SendMessageInput) {
    const env = requireEnv([
      "SENDBLUE_API_KEY",
      "SENDBLUE_API_SECRET",
      "SENDBLUE_PHONE_NUMBER",
    ]);
    const response = await this.request(`${env.SENDBLUE_API_BASE_URL}/api/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": env.SENDBLUE_API_KEY!,
        "sb-api-secret-key": env.SENDBLUE_API_SECRET!,
      },
      body: JSON.stringify({
        from_number: normalizeE164(env.SENDBLUE_PHONE_NUMBER!),
        number: normalizeE164(input.to),
        content: input.body,
        ...(input.mediaUrl ? { media_url: input.mediaUrl } : {}),
        ...(input.statusCallbackUrl ? { status_callback: input.statusCallbackUrl } : {}),
      }),
    });

    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const parsed = sendblueErrorSchema.safeParse(payload);
      const error = parsed.success ? parsed.data : undefined;
      const retryAfter = response.headers.get("retry-after");
      throw new SendblueApiError(
        error?.message ?? error?.error_message ?? `Sendblue request failed with HTTP ${response.status}`,
        response.status,
        error?.error_code === null || error?.error_code === undefined ? undefined : String(error.error_code),
        retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined,
      );
    }

    const sent = sendblueSendResponseSchema.parse(payload);
    return {
      provider: "sendblue" as const,
      providerMessageSid: sent.message_handle,
      status: sent.status.toLowerCase(),
      service: sent.service,
    };
  }
}

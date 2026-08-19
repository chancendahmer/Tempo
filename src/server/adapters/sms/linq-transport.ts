import { z } from "zod";
import { requireEnv } from "../../config/env";
import { MessagingTransport, SendMessageInput } from "./sms-transport";

const linqSendResponseSchema = z.object({
  message: z.object({
    id: z.string().min(1),
    delivery_status: z.string().min(1),
    service: z.enum(["iMessage", "RCS", "SMS"]).optional(),
  }),
});

const linqErrorSchema = z.object({
  error: z.object({
    status: z.number().optional(),
    code: z.union([z.number(), z.string()]).optional(),
    message: z.string().optional(),
  }).optional(),
}).passthrough();

export class LinqApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LinqApiError";
  }
}

export class LinqMessagingTransport implements MessagingTransport {
  constructor(private readonly request: typeof fetch = fetch) {}

  async send(input: SendMessageInput) {
    const env = requireEnv(["LINQ_API_KEY"]);
    const response = await this.request(`${env.LINQ_API_BASE_URL}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINQ_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [input.to],
        message: {
          parts: [{ type: "text", value: input.body }],
          idempotency_key: input.idempotencyKey,
        },
      }),
    });

    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const parsed = linqErrorSchema.safeParse(payload);
      const error = parsed.success ? parsed.data.error : undefined;
      const retryAfter = response.headers.get("retry-after");
      throw new LinqApiError(
        error?.message ?? `Linq request failed with HTTP ${response.status}`,
        response.status,
        error?.code === undefined ? undefined : String(error.code),
        retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined,
      );
    }

    const sent = linqSendResponseSchema.parse(payload).message;
    return {
      provider: "linq" as const,
      providerMessageSid: sent.id,
      status: sent.delivery_status,
      service: sent.service,
    };
  }
}

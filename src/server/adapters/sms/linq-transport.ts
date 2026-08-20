import { z } from "zod";
import { requireEnv } from "../../config/env";
import { MessagingTransport, SendMessageInput, TEXT_ONLY_CAPABILITIES } from "./sms-transport";

const linqSendResponseSchema = z.object({
  chat_id: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
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

  // Capabilities describe what this adapter implements today, not every feature
  // the Linq platform may expose. Rich methods can be enabled independently.
  getCapabilities() {
    return { ...TEXT_ONLY_CAPABILITIES, media: true, contactCards: true, inlineReplies: true };
  }

  async send(input: SendMessageInput) {
    const env = requireEnv(["LINQ_API_KEY"]);
    const response = await this.request(
      input.providerConversationId
        ? `${env.LINQ_API_BASE_URL}/chats/${encodeURIComponent(input.providerConversationId)}/messages`
        : `${env.LINQ_API_BASE_URL}/messages`,
      {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINQ_API_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(!input.providerConversationId ? { to: [input.to] } : {}),
        message: {
          parts: [{ type: "text", value: input.body }],
          idempotency_key: input.idempotencyKey,
          ...(input.replyToProviderMessageId
            ? { reply_to: { message_id: input.replyToProviderMessageId } }
            : {}),
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

    const parsed = linqSendResponseSchema.parse(payload);
    const sent = parsed.message;
    return {
      provider: "linq" as const,
      providerMessageSid: sent.id,
      status: sent.delivery_status,
      service: sent.service,
      providerConversationId: parsed.chat_id ?? input.providerConversationId,
      providerThreadId: input.providerThreadId,
      ...(parsed.from ? { providerLineAddress: parsed.from } : {}),
    };
  }
}

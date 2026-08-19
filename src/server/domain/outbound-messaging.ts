import { MessagingProvider, MessagingTransport, SendMessageResult } from "../adapters/sms/sms-transport";

export type OutboundBlockReason = "missing_consent" | "opted_out" | "paused" | "deleted" | "duplicate";

export type MessagingPermission = {
  phoneE164: string;
  userStatus: "active" | "paused" | "opted_out" | "deleted";
  latestConsent: "granted" | "revoked" | null;
  pausedUntil: Date | null;
};

export type OutboundReservation = {
  messageId: string;
  duplicate: boolean;
};

export interface OutboundMessageRepository {
  getPermission(userId: string): Promise<MessagingPermission | null>;
  reserve(input: {
    userId: string;
    body: string;
    kind: "coach" | "system" | "compliance";
    idempotencyKey: string;
    relatedInterventionId?: string;
  }): Promise<OutboundReservation>;
  cancel(messageId: string, reason: OutboundBlockReason): Promise<void>;
  markSubmitted(
    messageId: string,
    provider: MessagingProvider,
    providerMessageSid: string,
    service?: SendMessageResult["service"],
  ): Promise<void>;
  markFailed(messageId: string, error: unknown): Promise<void>;
}

export type SendSafeSmsInput = {
  userId: string;
  body: string;
  kind: "coach" | "system" | "compliance";
  idempotencyKey: string;
  statusCallbackUrl?: string;
  mediaUrl?: string;
  relatedInterventionId?: string;
};

export type SendSafeSmsResult =
  | { sent: true; messageId: string; provider: MessagingProvider; providerMessageSid: string; service?: SendMessageResult["service"] }
  | { sent: false; reason: OutboundBlockReason; messageId?: string };

export function evaluateMessagingPermission(
  permission: MessagingPermission | null,
  now: Date,
): { allowed: true } | { allowed: false; reason: Exclude<OutboundBlockReason, "duplicate"> } {
  if (!permission || permission.latestConsent !== "granted") return { allowed: false, reason: "missing_consent" };
  if (permission.userStatus === "opted_out") return { allowed: false, reason: "opted_out" };
  if (permission.userStatus === "deleted") return { allowed: false, reason: "deleted" };
  if (permission.userStatus === "paused" || (permission.pausedUntil && permission.pausedUntil > now)) {
    return { allowed: false, reason: "paused" };
  }
  return { allowed: true };
}

export class SafeSmsSender {
  constructor(
    private readonly repository: OutboundMessageRepository,
    private readonly transport: MessagingTransport,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async send(input: SendSafeSmsInput): Promise<SendSafeSmsResult> {
    const initialPermission = evaluateMessagingPermission(await this.repository.getPermission(input.userId), this.now());
    if (!initialPermission.allowed) return { sent: false, reason: initialPermission.reason };

    const reservation = await this.repository.reserve(input);
    if (reservation.duplicate) return { sent: false, reason: "duplicate", messageId: reservation.messageId };

    const latestPermission = await this.repository.getPermission(input.userId);
    const dispatchPermission = evaluateMessagingPermission(latestPermission, this.now());
    if (!dispatchPermission.allowed) {
      await this.repository.cancel(reservation.messageId, dispatchPermission.reason);
      return { sent: false, reason: dispatchPermission.reason, messageId: reservation.messageId };
    }

    try {
      const result = await this.transport.send({
        to: latestPermission!.phoneE164,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
        statusCallbackUrl: input.statusCallbackUrl,
        ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
      });
      await this.repository.markSubmitted(reservation.messageId, result.provider, result.providerMessageSid, result.service);
      return {
        sent: true,
        messageId: reservation.messageId,
        provider: result.provider,
        providerMessageSid: result.providerMessageSid,
        service: result.service,
      };
    } catch (error) {
      await this.repository.markFailed(reservation.messageId, error);
      throw error;
    }
  }
}

export type MessagingProvider = "linq" | "twilio" | "test";

export type SendMessageInput = {
  to: string;
  body: string;
  idempotencyKey: string;
  statusCallbackUrl?: string;
};

export type SendMessageResult = {
  provider: MessagingProvider;
  providerMessageSid: string;
  status: string;
  service?: "iMessage" | "RCS" | "SMS";
};

export interface MessagingTransport {
  send(input: SendMessageInput): Promise<SendMessageResult>;
}

export class TestMessagingTransport implements MessagingTransport {
  readonly sent: SendMessageInput[] = [];

  constructor(private readonly sidPrefix = "TEST") {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    this.sent.push(input);
    return {
      provider: "test",
      providerMessageSid: `${this.sidPrefix}${String(this.sent.length).padStart(6, "0")}`,
      status: "queued",
    };
  }
}

// Backward-compatible aliases while the rest of the product moves from SMS-only
// terminology to channel-neutral messaging.
export type SendSmsInput = SendMessageInput;
export type SendSmsResult = SendMessageResult;
export type SmsTransport = MessagingTransport;
export { TestMessagingTransport as TestSmsTransport };

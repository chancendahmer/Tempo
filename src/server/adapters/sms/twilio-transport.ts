import twilio from "twilio";
import { requireEnv } from "../../config/env";
import { SendSmsInput, SmsTransport } from "./sms-transport";

export class TwilioSmsTransport implements SmsTransport {
  async send(input: SendSmsInput) {
    const env = requireEnv([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_API_KEY_SID",
      "TWILIO_API_KEY_SECRET",
      "TWILIO_MESSAGING_SERVICE_SID",
    ]);
    const client = twilio(env.TWILIO_API_KEY_SID!, env.TWILIO_API_KEY_SECRET!, {
      accountSid: env.TWILIO_ACCOUNT_SID!,
    });
    const message = await client.messages.create({
      to: input.to,
      body: input.body,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!,
      statusCallback: new URL("/api/twilio/status", env.APP_BASE_URL).toString(),
    });

    return {
      provider: "twilio" as const,
      providerMessageSid: message.sid,
      status: message.status,
    };
  }
}

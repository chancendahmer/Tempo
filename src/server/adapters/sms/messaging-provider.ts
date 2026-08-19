import { getServerEnv } from "../../config/env";
import { LinqMessagingTransport } from "./linq-transport";
import { MessagingTransport } from "./sms-transport";
import { TwilioSmsTransport } from "./twilio-transport";

export function createMessagingTransport(): MessagingTransport {
  return getServerEnv().MESSAGING_PROVIDER === "twilio"
    ? new TwilioSmsTransport()
    : new LinqMessagingTransport();
}

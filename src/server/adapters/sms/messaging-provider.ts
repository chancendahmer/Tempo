import { getServerEnv } from "../../config/env";
import { LinqMessagingTransport } from "./linq-transport";
import { SendblueMessagingTransport } from "./sendblue-transport";
import { MessagingTransport } from "./sms-transport";
import { TwilioSmsTransport } from "./twilio-transport";

export function createMessagingTransport(): MessagingTransport {
  const provider = getServerEnv().MESSAGING_PROVIDER;
  if (provider === "twilio") return new TwilioSmsTransport();
  if (provider === "linq") return new LinqMessagingTransport();
  return new SendblueMessagingTransport();
}

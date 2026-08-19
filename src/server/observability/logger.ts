import pino from "pino";
import { getServerEnv } from "../config/env";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "phoneE164",
  "phone_number",
  "accessToken",
  "refreshToken",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.secret",
  "*.token",
];

export const logger = pino({
  name: "tempo",
  level: getServerEnv().LOG_LEVEL,
  redact: {
    paths: REDACTED_PATHS,
    censor: "[REDACTED]",
  },
  base: {
    service: "tempo",
  },
});

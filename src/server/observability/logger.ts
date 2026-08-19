import pino from "pino";
import { getServerEnv } from "../config/env";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.sb-api-key-id",
  "req.headers.sb-api-secret-key",
  "req.headers.sb-signing-secret",
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

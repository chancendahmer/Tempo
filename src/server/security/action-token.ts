import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const actionTokenPayloadSchema = z.object({
  v: z.literal(1),
  userId: z.uuid(),
  scope: z.enum(["calendar:connect", "calendar:disconnect", "account:delete"]),
  exp: z.number().int().positive(),
  jti: z.uuid(),
});

export type ActionTokenScope = z.infer<typeof actionTokenPayloadSchema>["scope"];
export type ActionTokenPayload = z.infer<typeof actionTokenPayloadSchema>;

export class InvalidActionTokenError extends Error {
  constructor() {
    super("This secure link is invalid or has expired.");
    this.name = "InvalidActionTokenError";
  }
}

function tokenKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

function signatureFor(encodedPayload: string, encodedKey: string): Buffer {
  return createHmac("sha256", tokenKey(encodedKey)).update(encodedPayload).digest();
}

export function issueActionToken(
  input: { userId: string; scope: ActionTokenScope; ttlSeconds?: number },
  encodedKey: string,
  now = new Date(),
): string {
  const payload: ActionTokenPayload = {
    v: 1,
    userId: input.userId,
    scope: input.scope,
    exp: Math.floor(now.getTime() / 1000) + (input.ttlSeconds ?? 15 * 60),
    jti: randomUUID(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signatureFor(encodedPayload, encodedKey).toString("base64url")}`;
}

export function verifyActionToken(
  token: string,
  expectedScope: ActionTokenScope,
  encodedKey: string,
  now = new Date(),
): ActionTokenPayload {
  try {
    const [encodedPayload, encodedSignature, ...extra] = token.split(".");
    if (!encodedPayload || !encodedSignature || extra.length > 0) throw new InvalidActionTokenError();
    const supplied = Buffer.from(encodedSignature, "base64url");
    if (supplied.toString("base64url") !== encodedSignature) throw new InvalidActionTokenError();
    const expected = signatureFor(encodedPayload, encodedKey);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new InvalidActionTokenError();

    const payload = actionTokenPayloadSchema.parse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));
    if (payload.scope !== expectedScope || payload.exp <= Math.floor(now.getTime() / 1000)) {
      throw new InvalidActionTokenError();
    }
    return payload;
  } catch (error) {
    if (error instanceof InvalidActionTokenError) throw error;
    throw new InvalidActionTokenError();
  }
}

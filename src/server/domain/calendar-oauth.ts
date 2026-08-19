import { createHash, randomBytes } from "node:crypto";
import { CalendarOAuthProvider } from "../adapters/calendar/calendar-provider";
import { decryptField, encryptField } from "../security/field-encryption";

export interface CalendarOAuthRepository {
  createState(input: {
    userId: string;
    stateHash: string;
    encryptedCodeVerifier: string;
    expiresAt: Date;
  }): Promise<void>;
  consumeState(stateHash: string, now: Date): Promise<{
    userId: string;
    encryptedCodeVerifier: string;
  } | null>;
  saveConnection(input: {
    userId: string;
    encryptedAccessToken?: string;
    encryptedRefreshToken: string;
    tokenExpiresAt?: Date;
    scopes: string[];
  }): Promise<void>;
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function beginCalendarOAuth(input: {
  userId: string;
  repository: CalendarOAuthRepository;
  provider: CalendarOAuthProvider;
  encryptionKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  await input.repository.createState({
    userId: input.userId,
    stateHash: hashOAuthState(state),
    encryptedCodeVerifier: encryptField(codeVerifier, input.encryptionKey),
    expiresAt: new Date(now.getTime() + 10 * 60_000),
  });
  return input.provider.authorizationUrl({ state, codeChallenge: pkceChallenge(codeVerifier) });
}

export async function completeCalendarOAuth(input: {
  state: string;
  code: string;
  repository: CalendarOAuthRepository;
  provider: CalendarOAuthProvider;
  encryptionKey: string;
  now?: Date;
}) {
  const consumed = await input.repository.consumeState(hashOAuthState(input.state), input.now ?? new Date());
  if (!consumed) throw new Error("OAuth state is invalid, expired, or already used");
  const codeVerifier = decryptField(consumed.encryptedCodeVerifier, input.encryptionKey);
  const tokens = await input.provider.exchangeCode({ code: input.code, codeVerifier });
  if (!tokens.refreshToken) throw new Error("Google did not return a refresh token");

  await input.repository.saveConnection({
    userId: consumed.userId,
    encryptedAccessToken: tokens.accessToken ? encryptField(tokens.accessToken, input.encryptionKey) : undefined,
    encryptedRefreshToken: encryptField(tokens.refreshToken, input.encryptionKey),
    tokenExpiresAt: tokens.expiresAt ?? undefined,
    scopes: tokens.scopes,
  });
  return { userId: consumed.userId };
}

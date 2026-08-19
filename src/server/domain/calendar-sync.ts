import { createHash } from "node:crypto";
import { CalendarAuthorizationError, CalendarDataProvider } from "../adapters/calendar/calendar-provider";
import { decryptField, encryptField } from "../security/field-encryption";

export type StoredCalendarConnection = {
  id: string;
  userId: string;
  encryptedAccessToken?: string | null;
  encryptedRefreshToken: string;
  tokenExpiresAt?: Date | null;
  scopes: string[];
};

export interface CalendarSyncRepository {
  getActiveConnection(userId: string): Promise<StoredCalendarConnection | null>;
  replaceBusyWindows(input: {
    connectionId: string;
    userId: string;
    windows: Array<{ startsAt: Date; endsAt: Date; sourceHash: string }>;
    encryptedAccessToken?: string;
    encryptedRefreshToken: string;
    tokenExpiresAt?: Date;
    scopes: string[];
    syncedAt: Date;
  }): Promise<void>;
  markRequiresReauth(connectionId: string): Promise<void>;
}

export function busyWindowHash(start: Date, end: Date): string {
  return createHash("sha256").update(`${start.toISOString()}|${end.toISOString()}`).digest("hex");
}

export async function syncCalendar(input: {
  userId: string;
  repository: CalendarSyncRepository;
  provider: CalendarDataProvider;
  encryptionKey: string;
  now?: Date;
  horizonDays?: number;
}) {
  const connection = await input.repository.getActiveConnection(input.userId);
  if (!connection) return { synced: false as const, reason: "not_connected" as const };

  const now = input.now ?? new Date();
  const timeMax = new Date(now.getTime() + (input.horizonDays ?? 14) * 86_400_000);
  const accessToken = connection.encryptedAccessToken
    ? decryptField(connection.encryptedAccessToken, input.encryptionKey)
    : undefined;
  const refreshToken = decryptField(connection.encryptedRefreshToken, input.encryptionKey);

  let result;
  try {
    result = await input.provider.getBusyWindows({
      accessToken,
      refreshToken,
      expiresAt: connection.tokenExpiresAt,
      timeMin: now,
      timeMax,
    });
  } catch (error) {
    if (error instanceof CalendarAuthorizationError) await input.repository.markRequiresReauth(connection.id);
    throw error;
  }

  const windows = result.windows
    .filter(({ start, end }) => end > start && start < timeMax && end > now)
    .slice(0, 10_000)
    .map(({ start, end }) => ({ startsAt: start, endsAt: end, sourceHash: busyWindowHash(start, end) }));

  const nextAccessToken = result.tokens.accessToken ?? accessToken;
  const nextRefreshToken = result.tokens.refreshToken ?? refreshToken;
  await input.repository.replaceBusyWindows({
    connectionId: connection.id,
    userId: connection.userId,
    windows,
    encryptedAccessToken: nextAccessToken ? encryptField(nextAccessToken, input.encryptionKey) : undefined,
    encryptedRefreshToken: encryptField(nextRefreshToken, input.encryptionKey),
    tokenExpiresAt: result.tokens.expiresAt ?? undefined,
    scopes: result.tokens.scopes.length > 0 ? result.tokens.scopes : connection.scopes,
    syncedAt: now,
  });
  return { synced: true as const, windowCount: windows.length, timeMin: now, timeMax };
}

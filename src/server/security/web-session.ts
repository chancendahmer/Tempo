import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDatabase, TempoDatabase } from "../db/client";
import { calendarConnections, users, webSessions } from "../db/schema";

export const WEB_SESSION_COOKIE = "tempo_session";
export const WEB_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type WebAccount = {
  userId: string;
  displayName: string | null;
  phoneLast4: string;
  phoneVerified: boolean;
  onboardingState: (typeof users.$inferSelect)["onboardingState"];
  profileInstructions: string | null;
  profileComplete: boolean;
  calendarStatus: (typeof calendarConnections.$inferSelect)["status"] | null;
};

export class WebSessionService {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async create(userId: string, now = new Date(), activated = false) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + WEB_SESSION_TTL_SECONDS * 1_000);
    await this.database.insert(webSessions).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      activatedAt: activated ? now : null,
      lastSeenAt: now,
    });
    return { token, expiresAt };
  }

  async findAccount(token: string | undefined, now = new Date()): Promise<WebAccount | null> {
    if (!token) return null;
    const [row] = await this.database
      .select({
        sessionId: webSessions.id,
        userId: users.id,
        displayName: users.displayName,
        phoneE164: users.phoneE164,
        phoneVerifiedAt: users.phoneVerifiedAt,
        sessionActivatedAt: webSessions.activatedAt,
        onboardingState: users.onboardingState,
        profileInstructions: users.profileInstructions,
        profileCompletedAt: users.profileCompletedAt,
        calendarStatus: calendarConnections.status,
      })
      .from(webSessions)
      .innerJoin(users, eq(users.id, webSessions.userId))
      .leftJoin(calendarConnections, eq(calendarConnections.userId, users.id))
      .where(and(
        eq(webSessions.tokenHash, hashToken(token)),
        isNull(webSessions.revokedAt),
        gt(webSessions.expiresAt, now),
      ))
      .limit(1);
    if (!row) return null;
    await this.database.update(webSessions).set({ lastSeenAt: now, updatedAt: now }).where(eq(webSessions.id, row.sessionId));
    return {
      userId: row.userId,
      displayName: row.displayName,
      phoneLast4: row.phoneE164.slice(-4),
      phoneVerified: Boolean(row.phoneVerifiedAt && row.sessionActivatedAt),
      onboardingState: row.onboardingState,
      profileInstructions: row.profileInstructions,
      profileComplete: Boolean(row.profileCompletedAt),
      calendarStatus: row.calendarStatus,
    };
  }

  async activatePending(userId: string, now = new Date()) {
    const recent = new Date(now.getTime() - 30 * 60_000);
    await this.database.update(webSessions).set({ activatedAt: now, updatedAt: now }).where(and(
      eq(webSessions.userId, userId),
      isNull(webSessions.activatedAt),
      isNull(webSessions.revokedAt),
      gt(webSessions.createdAt, recent),
      gt(webSessions.expiresAt, now),
    ));
  }

  async updateProfile(userId: string, input: { displayName: string; profileInstructions: string | null }, now = new Date()) {
    const [updated] = await this.database.update(users).set({
      displayName: input.displayName,
      profileInstructions: input.profileInstructions,
      profileCompletedAt: now,
      updatedAt: now,
    }).where(eq(users.id, userId)).returning({ id: users.id });
    return Boolean(updated);
  }

  async revoke(token: string | undefined, now = new Date()) {
    if (!token) return;
    await this.database.update(webSessions).set({ revokedAt: now, updatedAt: now })
      .where(and(eq(webSessions.tokenHash, hashToken(token)), isNull(webSessions.revokedAt)));
  }
}

export function publicAccount(account: WebAccount) {
  if (!account.phoneVerified) {
    return {
      displayName: null,
      phoneLast4: account.phoneLast4,
      phoneVerified: false,
      onboardingState: "pending_verification",
      profileInstructions: null,
      profileComplete: false,
      calendarStatus: null,
    };
  }
  return {
    displayName: account.displayName,
    phoneLast4: account.phoneLast4,
    phoneVerified: account.phoneVerified,
    onboardingState: account.onboardingState,
    profileInstructions: account.profileInstructions,
    profileComplete: account.profileComplete,
    calendarStatus: account.calendarStatus,
  };
}

export function isTrustedMutationOrigin(origin: string | null, appBaseUrl: string) {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appBaseUrl).origin;
  } catch {
    return false;
  }
}

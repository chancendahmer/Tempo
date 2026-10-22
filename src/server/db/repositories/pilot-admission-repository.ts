import { eq } from "drizzle-orm";
import { isVerifiedExistingPilotAccount } from "../../domain/pilot-admission";
import { getDatabase, type TempoDatabase } from "../client";
import { users } from "../schema";

export class PilotAdmissionRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async isVerifiedExisting(phoneE164: string): Promise<boolean> {
    const [account] = await this.database.select({ phoneVerifiedAt: users.phoneVerifiedAt, onboardingState: users.onboardingState })
      .from(users).where(eq(users.phoneE164, phoneE164)).limit(1);
    return isVerifiedExistingPilotAccount(account);
  }

  async isOptedOut(phoneE164: string): Promise<boolean> {
    const [account] = await this.database.select({ status: users.status }).from(users)
      .where(eq(users.phoneE164, phoneE164)).limit(1);
    return account?.status === "opted_out";
  }
}

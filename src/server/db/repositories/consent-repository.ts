import { ConsentRepository } from "../../domain/consent";
import { getDatabase, TempoDatabase } from "../client";
import { consentRecords, scheduledActions, users } from "../schema";

export class DrizzleConsentRepository implements ConsentRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async grantWebConsent(input: Parameters<ConsentRepository["grantWebConsent"]>[0]) {
    return this.database.transaction(async (transaction) => {
      const [user] = await transaction
        .insert(users)
        .values({
          phoneE164: input.phoneE164,
          status: "active",
          onboardingState: "introduction",
        })
        .onConflictDoUpdate({
          target: users.phoneE164,
          set: {
            status: "active",
            pausedUntil: null,
            optedOutAt: null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: users.id });

      await transaction.insert(consentRecords).values({
        userId: user.id,
        status: "granted",
        channel: "web",
        disclosureVersion: input.disclosureVersion,
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
        sourceIpHash: input.sourceIpHash,
        userAgent: input.userAgent,
        evidence: input.evidence,
      });

      if (input.scheduleInitialMessages) {
        await transaction
          .insert(scheduledActions)
          .values({
            userId: user.id,
            kind: "send_welcome",
            idempotencyKey: `welcome:${user.id}:${input.disclosureVersion}`,
            runAt: new Date(),
          })
          .onConflictDoNothing({ target: scheduledActions.idempotencyKey });

        await transaction.insert(scheduledActions).values({
          userId: user.id,
          kind: "evaluate_context",
          idempotencyKey: `context-evaluation:${user.id}:initial`,
          runAt: new Date(),
        }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      }

      return { userId: user.id };
    });
  }
}

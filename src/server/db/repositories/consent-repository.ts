import { ConsentRepository } from "../../domain/consent";
import { sql } from "drizzle-orm";
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
            // Website consent cannot clear a carrier/SMS STOP. Only explicit
            // inbound START re-enables that account through the compliance path.
            status: sql`case when ${users.status} = 'opted_out' then ${users.status} else 'active'::user_status end`,
            pausedUntil: null,
            optedOutAt: sql`case when ${users.status} = 'opted_out' then ${users.optedOutAt} else null end`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: users.id, status: users.status });

      await transaction.insert(consentRecords).values({
        userId: user.id,
        status: user.status === "opted_out" ? "revoked" : "granted",
        channel: "web",
        disclosureVersion: input.disclosureVersion,
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
        sourceIpHash: input.sourceIpHash,
        userAgent: input.userAgent,
        evidence: input.evidence,
      });

      if (input.scheduleInitialMessages && user.status !== "opted_out") {
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

import { and, eq, gt } from "drizzle-orm";
import { ExtensionSignalRepository } from "../../domain/extension-signals";
import { getDatabase, TempoDatabase } from "../client";
import { extensionSignalSnapshots } from "../schema";

export class DrizzleExtensionSignalRepository implements ExtensionSignalRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async publish(userId: string, signal: Parameters<ExtensionSignalRepository["publish"]>[1]) {
    await this.database.insert(extensionSignalSnapshots).values({
      userId,
      extensionKey: signal.extensionKey,
      signalType: signal.signalType,
      payload: signal.payload,
      confidence: signal.confidence,
      observedAt: signal.observedAt,
      validUntil: signal.validUntil,
    }).onConflictDoUpdate({
      target: [
        extensionSignalSnapshots.userId,
        extensionSignalSnapshots.extensionKey,
        extensionSignalSnapshots.signalType,
      ],
      set: {
        payload: signal.payload,
        confidence: signal.confidence,
        observedAt: signal.observedAt,
        validUntil: signal.validUntil,
        updatedAt: signal.observedAt,
      },
    });
  }

  async getActive(userId: string, now: Date) {
    return this.database.select({
      extensionKey: extensionSignalSnapshots.extensionKey,
      signalType: extensionSignalSnapshots.signalType,
      payload: extensionSignalSnapshots.payload,
      confidence: extensionSignalSnapshots.confidence,
      observedAt: extensionSignalSnapshots.observedAt,
      validUntil: extensionSignalSnapshots.validUntil,
    }).from(extensionSignalSnapshots).where(and(
      eq(extensionSignalSnapshots.userId, userId),
      gt(extensionSignalSnapshots.validUntil, now),
    ));
  }
}

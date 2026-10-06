import type { SendSafeSmsInput, SendSafeSmsResult } from "./outbound-messaging";

interface ReviewDeliveryRepository {
  reserve(userId: string, now: Date): Promise<{ id: string } | null>;
  ready(id: string, now: Date): Promise<{ body: string } | null>;
  finish(id: string, messageId: string | null, now?: Date): Promise<void>;
}
class ReviewDeferred extends Error {}

/** The recurring evaluator resumes reservations; the existing SMS adapter handles ambiguous acceptance. */
export async function deliverItemReview(input: {
  userId: string; enabled: boolean; repository: ReviewDeliveryRepository;
  sender: { send(input: SendSafeSmsInput): Promise<SendSafeSmsResult> };
  runOwned: <T>(operation: () => Promise<T>) => Promise<T>;
  signal?: AbortSignal; now?: () => Date;
}): Promise<boolean> {
  if (!input.enabled) return false;
  const now = input.now ?? (() => new Date());
  const reserved = await input.runOwned(() => input.repository.reserve(input.userId, now()));
  if (!reserved) return false;
  const ready = await input.runOwned(() => input.repository.ready(reserved.id, now()));
  if (!ready) return true;
  try {
    const result = await input.sender.send({ userId: input.userId, body: ready.body, kind: "coach", idempotencyKey: `item-review:${reserved.id}`, signal: input.signal, runOwned: input.runOwned,
      assertOwnership: () => input.runOwned(async () => { if (!await input.repository.ready(reserved.id, now())) throw new ReviewDeferred(); }),
    });
    await input.runOwned(() => input.repository.finish(reserved.id, result.sent || result.reason === "duplicate" ? result.messageId! : null, now()));
  } catch (error) { if (!(error instanceof ReviewDeferred)) throw error; }
  return true;
}

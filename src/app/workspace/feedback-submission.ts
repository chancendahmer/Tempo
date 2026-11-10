import { z } from "zod";
import type { PilotFeedbackInput, PilotFeedbackReceipt } from "../../server/domain/pilot-feedback";

export const FEEDBACK_RECOVERY_MESSAGE = "Your report could not be confirmed. Your draft is still here. Check your connection and retry with the same details.";
export const FEEDBACK_TIMEOUT_MS = 15_000;
type FeedbackDraft = Omit<PilotFeedbackInput, "requestId">;
const receiptSchema = z.object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }) }).strict();
const errorSchema = z.object({ error: z.string().trim().min(1).max(240) }).strict();
const actionableStatuses = new Set([400, 401, 403, 409, 413, 429]);

export class FeedbackSubmissionError extends Error {
  constructor(message: string, readonly accountChanged = false) { super(message); }
}

/** Mounted-dialog retry identity only: no offline queue or reload persistence. */
export class FeedbackSubmission {
  private attempt: { content: string; owner: string; requestId: string } | undefined;

  // Native browser fetch must not receive this class instance as its receiver.
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args), private readonly newId = () => crypto.randomUUID()) {}

  async submit(draft: FeedbackDraft, owner: string): Promise<PilotFeedbackReceipt> {
    if (!owner) throw new FeedbackSubmissionError("Reopen feedback from your signed-in account.", true);
    const content = JSON.stringify({ type: draft.type, section: draft.section, impact: draft.impact, detail: (draft.detail ?? "").trim(), followUpConsent: draft.followUpConsent });
    if (!this.attempt || this.attempt.content !== content || this.attempt.owner !== owner) this.attempt = { content, owner, requestId: this.newId() };
    const body = JSON.stringify({ ...JSON.parse(content), requestId: this.attempt.requestId });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new FeedbackSubmissionError(FEEDBACK_RECOVERY_MESSAGE));
      }, FEEDBACK_TIMEOUT_MS);
    });
    try {
      // The race also bounds response-body reads, and unlocks the dialog even if
      // a transport does not promptly honor abort. It never retries automatically.
      return await Promise.race([timeout, (async () => {
        const response = await this.fetcher("/api/account/feedback", { method: "POST", headers: { "Content-Type": "application/json", "x-tempo-account": owner }, body, signal: controller.signal });
        if (response.status === 401) throw new FeedbackSubmissionError("Sign in again to send feedback.", true);
        const payload: unknown = await response.json();
        if (response.status === 409 && typeof payload === "object" && payload !== null && "code" in payload && payload.code === "account_changed") throw new FeedbackSubmissionError("Your account changed. Reopen feedback before sending.", true);
        if (!response.ok) {
          const parsed = errorSchema.safeParse(payload);
          throw new FeedbackSubmissionError(actionableStatuses.has(response.status) && parsed.success ? parsed.data.error : FEEDBACK_RECOVERY_MESSAGE, response.status === 401);
        }
        const parsed = z.object({ receipt: receiptSchema, cacheKey: z.string() }).strict().safeParse(payload);
        if (!parsed.success) throw new FeedbackSubmissionError(FEEDBACK_RECOVERY_MESSAGE);
        if (parsed.data.cacheKey !== owner) throw new FeedbackSubmissionError("Your account changed. Reopen feedback before sending.", true);
        return parsed.data.receipt;
      })()]);
    } catch (error) {
      if (error instanceof FeedbackSubmissionError) throw error;
      throw new FeedbackSubmissionError(FEEDBACK_RECOVERY_MESSAGE);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

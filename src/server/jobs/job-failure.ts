import { DatabaseError } from "pg";
import { InboundOwnershipLostError } from "../domain/inbound-execution";
import { OutboundDeliveryPendingError } from "../domain/outbound-messaging";
import { logger } from "../observability/logger";

/** Driver messages and causes can include private SQL bind parameters. */
export function classifyJobFailure(error: unknown): { category: "database" | "unexpected"; sqlState?: string } {
  const databaseError = error instanceof DatabaseError ? error : error instanceof Error && error.cause instanceof DatabaseError ? error.cause : undefined;
  if (!databaseError) return { category: "unexpected" };
  const sqlState = databaseError.code && /^[A-Z0-9]{5}$/.test(databaseError.code) ? databaseError.code : undefined;
  return { category: "database", ...(sqlState ? { sqlState } : {}) };
}

type JobFailureOptions = {
  jobId: string;
  operation: string;
  logMessage?: string;
  level?: "warn" | "error";
  signal?: AbortSignal;
  reconciliationError?: Error;
  record?: (safeError: Error) => Promise<unknown>;
};

/** Preserve retry and ownership behavior with a fresh error at every sink. */
export async function failJob(error: unknown, options: JobFailureOptions): Promise<never> {
  const { jobId, operation, signal, record, level = "error", logMessage = `${operation} failed` } = options;
  if (error instanceof InboundOwnershipLostError) {
    logger.warn({ category: "ownership_lost", jobId }, `${operation} interrupted`);
    throw new InboundOwnershipLostError();
  }
  if (signal?.aborted) {
    logger.warn({ category: "cancelled", jobId }, `${operation} interrupted`);
    throw new DOMException(`${operation} cancelled`, "AbortError");
  }
  const reconciliation = options.reconciliationError ?? (error instanceof OutboundDeliveryPendingError ? new OutboundDeliveryPendingError() : undefined);
  const failure: { category: string; sqlState?: string } = reconciliation ? { category: "delivery_pending" } : classifyJobFailure(error);
  const safeError = reconciliation ?? new Error(`${operation} failed (${failure.category}${failure.sqlState ? ` SQLSTATE ${failure.sqlState}` : ""})`);
  if (record) {
    try { await record(safeError); }
    catch (recordingError) {
      logger.error({ ...classifyJobFailure(recordingError), jobId }, "scheduled job failure record unavailable");
    }
  }
  logger[level]({ ...failure, jobId }, logMessage);
  throw safeError;
}

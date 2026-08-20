import { ContextEvaluation, ContextPolicy, ContextSignals, evaluateContext } from "./context-engine";
import { InterventionStyle, selectInterventionStyle } from "./intervention-strategy";

export interface InterventionOpportunityPlanner {
  plan(input: {
    snapshotId: string;
    userId: string;
    taskId: string;
    style: InterventionStyle;
    decision: "holdout" | "send";
    now: Date;
  }): Promise<string>;
}

export interface InterventionDecisionReviewer {
  review(input: {
    evaluation: ContextEvaluation;
    signals: ContextSignals;
    policy: ContextPolicy;
    now: Date;
  }): Promise<{ send: boolean; reason: string; model: string }>;
}

export interface ContextEngineRepository {
  getActivePolicy(): Promise<ContextPolicy>;
  loadSignals(userId: string, now: Date): Promise<ContextSignals | null>;
  saveSnapshot(input: {
    userId: string;
    taskId?: string;
    policyId: string;
    capturedAt: Date;
    evaluation: ContextEvaluation;
  }): Promise<{ id: string; created: boolean }>;
}

export async function evaluateUserContext(input: {
  userId: string;
  repository: ContextEngineRepository;
  shadowMode: boolean;
  planner?: InterventionOpportunityPlanner;
  reviewer?: InterventionDecisionReviewer;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [policy, signals] = await Promise.all([
    input.repository.getActivePolicy(),
    input.repository.loadSignals(input.userId, now),
  ]);
  if (!signals) return { evaluated: false as const, reason: "user_not_found" as const };
  let evaluation = evaluateContext({ signals, policy, now, shadowMode: input.shadowMode });
  if (evaluation.decision === "send" && input.reviewer) {
    const review = await input.reviewer.review({ evaluation, signals, policy, now });
    evaluation = {
      ...evaluation,
      decision: review.send ? "send" : "blocked",
      reasonCodes: [...evaluation.reasonCodes, review.send ? "ai_review_send" : "ai_review_skip"],
      inputs: {
        ...evaluation.inputs,
        hybridReview: { send: review.send, reason: review.reason, model: review.model },
      },
    };
  }
  const snapshot = await input.repository.saveSnapshot({
    userId: input.userId,
    taskId: evaluation.task?.id,
    policyId: policy.id,
    capturedAt: now,
    evaluation,
  });
  let interventionId: string | undefined;
  if (
    snapshot.created &&
    input.planner &&
    evaluation.task &&
    (evaluation.decision === "send" || evaluation.decision === "holdout")
  ) {
    interventionId = await input.planner.plan({
      snapshotId: snapshot.id,
      userId: input.userId,
      taskId: evaluation.task.id,
      style: selectInterventionStyle(evaluation.task, signals, now),
      decision: evaluation.decision,
      now,
    });
  }
  return { evaluated: true as const, snapshotId: snapshot.id, snapshotCreated: snapshot.created, interventionId, evaluation };
}

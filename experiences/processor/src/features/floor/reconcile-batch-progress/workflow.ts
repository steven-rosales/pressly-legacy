import type { JsonValue } from "@pressly/codec"
import type { ProductionBatchProgressReconciliationResult } from "@pressly/production-system/contracts/floor/reconcile-batch-progress"
import type {
  ReconcileBatchProgressRequest,
  ReconcileBatchProgressWorkflowIntent,
} from "./types.ts"

type ReconcileBatchProgressWorkflowDependencies = Readonly<{
  execute: (
    request: ReconcileBatchProgressRequest
  ) => Promise<ProductionBatchProgressReconciliationResult>
  makeIdempotencyKey: (input: {
    operation: string
    payload: JsonValue
  }) => Promise<string>
}>

export const makeReconcileBatchProgressWorkflow =
  (
    dependencies: ReconcileBatchProgressWorkflowDependencies
  ): ((
    intent: ReconcileBatchProgressWorkflowIntent
  ) => Promise<ProductionBatchProgressReconciliationResult>) =>
  async (intent) => {
    const { kind, ...request } = intent
    const idempotencyKey = await dependencies.makeIdempotencyKey({
      operation:
        kind === "preview"
          ? "review-production-batch-progress-reconciliation"
          : "confirm-production-batch-progress-reconciliation",
      payload: request,
    })
    return dependencies.execute({ ...request, idempotencyKey })
  }

import type { JsonValue } from "@pressly/codec"
import type { ProductionBatchMembershipMutationResult } from "@pressly/production-system/contracts/floor/unfreeze-batch-membership"
import type {
  UnfreezeBatchMembershipRequest,
  UnfreezeBatchMembershipWorkflowIntent,
} from "./types.ts"

type UnfreezeBatchMembershipWorkflowDependencies = Readonly<{
  execute: (
    request: UnfreezeBatchMembershipRequest
  ) => Promise<ProductionBatchMembershipMutationResult>
  makeIdempotencyKey: (input: {
    operation: string
    payload: JsonValue
  }) => Promise<string>
}>

export const makeUnfreezeBatchMembershipWorkflow =
  (
    dependencies: UnfreezeBatchMembershipWorkflowDependencies
  ): ((
    intent: UnfreezeBatchMembershipWorkflowIntent
  ) => Promise<ProductionBatchMembershipMutationResult>) =>
  async (intent) => {
    const idempotencyKey = await dependencies.makeIdempotencyKey({
      operation: "unfreeze-production-batch",
      payload: {
        productionRunId: intent.productionRunId,
        productionBatchId: intent.productionBatchId,
        expectedQueueVersion: intent.expectedQueueVersion,
        expectedBatchVersion: intent.expectedBatchVersion,
      },
    })

    return dependencies.execute({ ...intent, idempotencyKey })
  }

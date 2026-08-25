import type { JsonValue } from "@pressly/codec"
import type { ProductionBatchMembershipMutationResult } from "@pressly/production-system/contracts/floor/freeze-batch-membership"
import type {
  FreezeBatchMembershipRequest,
  FreezeBatchMembershipWorkflowIntent,
} from "./types.ts"

type FreezeBatchMembershipWorkflowDependencies = Readonly<{
  execute: (
    request: FreezeBatchMembershipRequest
  ) => Promise<ProductionBatchMembershipMutationResult>
  makeIdempotencyKey: (input: {
    operation: string
    payload: JsonValue
  }) => Promise<string>
}>

export const makeFreezeBatchMembershipWorkflow =
  (
    dependencies: FreezeBatchMembershipWorkflowDependencies
  ): ((
    intent: FreezeBatchMembershipWorkflowIntent
  ) => Promise<ProductionBatchMembershipMutationResult>) =>
  async (intent) => {
    const idempotencyKey = await dependencies.makeIdempotencyKey({
      operation: "freeze-production-batch",
      payload: {
        productionRunId: intent.productionRunId,
        productionBatchId: intent.productionBatchId,
        expectedQueueVersion: intent.expectedQueueVersion,
        expectedBatchVersion: intent.expectedBatchVersion,
      },
    })
    return dependencies.execute({ ...intent, idempotencyKey })
  }

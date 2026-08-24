import type { JsonValue } from "@pressly/codec"
import type { ProductionMutationResult } from "@pressly/production-system/contracts/floor/assign-stage-machines"
import type {
  AssignStageMachinesRequest,
  AssignStageMachinesWorkflowIntent,
} from "./types.ts"

type AssignStageMachinesWorkflowDependencies = Readonly<{
  execute: (
    request: AssignStageMachinesRequest
  ) => Promise<ProductionMutationResult>
  makeIdempotencyKey: (input: {
    operation: string
    payload: JsonValue
  }) => Promise<string>
}>

export const makeAssignStageMachinesWorkflow =
  (
    dependencies: AssignStageMachinesWorkflowDependencies
  ): ((
    intent: AssignStageMachinesWorkflowIntent
  ) => Promise<ProductionMutationResult>) =>
  async (intent) => {
    const idempotencyKey = await dependencies.makeIdempotencyKey({
      operation: "assign-stage-machines",
      payload: {
        locationId: intent.locationId,
        stageRunId: intent.stageRunId,
        machineIds: intent.machineIds,
        expectedVersion: intent.expectedVersion,
      },
    })
    return dependencies.execute({ ...intent, idempotencyKey })
  }

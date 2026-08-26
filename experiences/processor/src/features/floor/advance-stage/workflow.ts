import type { JsonValue } from "@pressly/codec"
import type { AdvanceProductionStageResult } from "@pressly/production-system/contracts/floor/advance-stage"
import type {
  AdvanceStageRequest,
  AdvanceStageWorkflowIntent,
} from "./types.ts"

type AdvanceStageWorkflowDependencies = Readonly<{
  execute: (
    request: AdvanceStageRequest
  ) => Promise<AdvanceProductionStageResult>
  makeIdempotencyKey: (input: {
    operation: string
    payload: JsonValue
  }) => Promise<string>
}>

const idempotencyInput = (
  intent: AdvanceStageWorkflowIntent
): Readonly<{ operation: string; payload: JsonValue }> =>
  intent.kind === "attempt"
    ? {
        operation: `${intent.transition}-production-stage`,
        payload: {
          locationId: intent.locationId,
          stageRunId: intent.stageRunId,
          transition: intent.transition,
          expectedVersion: intent.expectedVersion,
        },
      }
    : {
        operation:
          intent.transition === "start"
            ? "confirm-early-production-stage-start"
            : "confirm-early-production-stage-completion",
        payload: {
          locationId: intent.locationId,
          stageRunId: intent.stageRunId,
          expectedVersion: intent.expectedVersion,
          confirmation: intent.confirmation,
        },
      }

export const makeAdvanceStageWorkflow =
  (
    dependencies: AdvanceStageWorkflowDependencies
  ): ((
    intent: AdvanceStageWorkflowIntent
  ) => Promise<AdvanceProductionStageResult>) =>
  async (intent) => {
    const idempotencyKey = await dependencies.makeIdempotencyKey(
      idempotencyInput(intent)
    )

    return dependencies.execute({
      locationId: intent.locationId,
      stageRunId: intent.stageRunId,
      transition: intent.transition,
      expectedVersion: intent.expectedVersion,
      idempotencyKey,
      ...(intent.kind === "confirmation"
        ? { confirmation: intent.confirmation }
        : {}),
    })
  }

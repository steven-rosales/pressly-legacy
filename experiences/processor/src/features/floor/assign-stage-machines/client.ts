import {
  productionMutationResultSchema,
  type ProductionMutationResult,
} from "@pressly/production-system/contracts/floor/assign-stage-machines"
import type {
  AssignStageMachinesClient,
  AssignStageMachinesClientOperation,
  AssignStageMachinesRequest,
} from "./types.ts"

type AssignStageMachinesRequestBody = Pick<
  AssignStageMachinesRequest,
  "machineIds" | "expectedVersion" | "idempotencyKey"
>

export type AssignStageMachinesRequestTransport = (
  input: Readonly<{
    method: "PUT"
    path: string
    body: AssignStageMachinesRequestBody
  }>,
  outputSchema: typeof productionMutationResultSchema
) => Promise<ProductionMutationResult>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string; stageRunId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeAssignStageMachinesClient =
  (input: {
    operation: AssignStageMachinesClientOperation
    request: AssignStageMachinesRequestTransport
  }): AssignStageMachinesClient =>
  async ({ locationId, stageRunId, ...body }) =>
    input.request(
      {
        method: input.operation.http.machines.method,
        path: renderPath(input.operation.http.machines.path, {
          locationId,
          stageRunId,
        }),
        body,
      },
      productionMutationResultSchema
    )

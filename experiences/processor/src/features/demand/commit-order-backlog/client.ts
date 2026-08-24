import {
  productionOrderBacklogCommitResultSchema,
  type CommitProductionOrderBacklogCommand,
  type ProductionOrderBacklogCommitResult,
} from "@pressly/production-system/contracts/read-models/production-order-backlog"
import type {
  CommitOrderBacklogClient,
  CommitOrderBacklogClientOperation,
} from "./types.ts"

type CommitOrderBacklogRequestBody = Omit<
  CommitProductionOrderBacklogCommand,
  "locationId"
>

export type CommitOrderBacklogRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: CommitOrderBacklogRequestBody
  }>,
  outputSchema: typeof productionOrderBacklogCommitResultSchema
) => Promise<ProductionOrderBacklogCommitResult>

export const makeCommitOrderBacklogClient = (input: {
  operation: CommitOrderBacklogClientOperation
  request: CommitOrderBacklogRequestTransport
}): CommitOrderBacklogClient => {
  const surface = input.operation.http["order-backlog"]
  return async ({ locationId, request }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path.replace(
          ":locationId",
          encodeURIComponent(locationId)
        ),
        body: request,
      },
      productionOrderBacklogCommitResultSchema
    )
}

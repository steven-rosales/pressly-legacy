import {
  commitProductionOrderRouteResultSchema,
  type CommitProductionOrderRouteRequest,
  type CommitProductionOrderRouteResult,
} from "@pressly/production-system/contracts/read-models/production-order-control"
import type {
  CommitOrderRouteClient,
  CommitOrderRouteClientOperation,
} from "./types.ts"

export type CommitOrderRouteRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: CommitProductionOrderRouteRequest
  }>,
  outputSchema: typeof commitProductionOrderRouteResultSchema
) => Promise<CommitProductionOrderRouteResult>

const renderPath = (
  template: string,
  parameters: Readonly<{
    locationId: string
    productionRunId: string
    productionOrderId: string
  }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeCommitOrderRouteClient = (input: {
  operation: CommitOrderRouteClientOperation
  request: CommitOrderRouteRequestTransport
}): CommitOrderRouteClient => {
  const surface = input.operation.http.route
  return async ({ locationId, productionRunId, productionOrderId, request }) =>
    input.request(
      {
        method: surface.method,
        path: renderPath(surface.path, {
          locationId,
          productionRunId,
          productionOrderId,
        }),
        body: request,
      },
      commitProductionOrderRouteResultSchema
    )
}

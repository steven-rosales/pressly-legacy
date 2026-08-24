import {
  productionOrderRouteProposalSchema,
  type PreviewProductionOrderRouteRequest,
  type ProductionOrderRouteProposal,
} from "@pressly/production-system/contracts/read-models/production-order-control"
import type {
  PreviewOrderRouteClient,
  PreviewOrderRouteClientOperation,
} from "./types.ts"

export type PreviewOrderRouteRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: PreviewProductionOrderRouteRequest
  }>,
  outputSchema: typeof productionOrderRouteProposalSchema
) => Promise<ProductionOrderRouteProposal>

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

export const makePreviewOrderRouteClient =
  (input: {
    operation: PreviewOrderRouteClientOperation
    request: PreviewOrderRouteRequestTransport
  }): PreviewOrderRouteClient =>
  async ({ locationId, productionRunId, productionOrderId, request: body }) =>
    input.request(
      {
        method: input.operation.http.preview.method,
        path: renderPath(input.operation.http.preview.path, {
          locationId,
          productionRunId,
          productionOrderId,
        }),
        body,
      },
      productionOrderRouteProposalSchema
    )

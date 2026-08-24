import {
  exactProductionOrderPlacementResultSchema,
  type ExactProductionOrderPlacementResult,
  type PlaceProductionOrderExactlyCommand,
} from "@pressly/production-system/contracts/read-models/production-order-placement"
import type {
  PlaceOrderExactlyClient,
  PlaceOrderExactlyClientOperation,
} from "./types.ts"

type PlaceOrderExactlyRequestBody = Omit<
  PlaceProductionOrderExactlyCommand,
  "locationId" | "productionRunId" | "productionBatchId" | "productionOrderId"
>

export type PlaceOrderExactlyRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: PlaceOrderExactlyRequestBody
  }>,
  outputSchema: typeof exactProductionOrderPlacementResultSchema
) => Promise<ExactProductionOrderPlacementResult>

export const makePlaceOrderExactlyClient = (input: {
  operation: PlaceOrderExactlyClientOperation
  request: PlaceOrderExactlyRequestTransport
}): PlaceOrderExactlyClient => {
  const surface = input.operation.http.place
  return async ({
    locationId,
    productionRunId,
    productionBatchId,
    productionOrderId,
    ...body
  }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path
          .replace(":locationId", encodeURIComponent(locationId))
          .replace(":productionRunId", encodeURIComponent(productionRunId))
          .replace(":productionBatchId", encodeURIComponent(productionBatchId))
          .replace(":productionOrderId", encodeURIComponent(productionOrderId)),
        body,
      },
      exactProductionOrderPlacementResultSchema
    )
}

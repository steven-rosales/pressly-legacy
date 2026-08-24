import {
  automaticProductionOrderPlacementResultSchema,
  type AutomaticProductionOrderPlacementResult,
  type PlaceProductionOrderAutomaticallyCommand,
} from "@pressly/production-system/contracts/read-models/production-order-placement"
import type {
  PlaceOrderAutomaticallyClient,
  PlaceOrderAutomaticallyClientOperation,
} from "./types.ts"

type PlaceOrderAutomaticallyRequestBody = Omit<
  PlaceProductionOrderAutomaticallyCommand,
  "locationId" | "productionRunId" | "productionOrderId"
>

export type PlaceOrderAutomaticallyRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: PlaceOrderAutomaticallyRequestBody
  }>,
  outputSchema: typeof automaticProductionOrderPlacementResultSchema
) => Promise<AutomaticProductionOrderPlacementResult>

export const makePlaceOrderAutomaticallyClient = (input: {
  operation: PlaceOrderAutomaticallyClientOperation
  request: PlaceOrderAutomaticallyRequestTransport
}): PlaceOrderAutomaticallyClient => {
  const surface = input.operation.http.place
  return async ({ locationId, productionRunId, productionOrderId, ...body }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path
          .replace(":locationId", encodeURIComponent(locationId))
          .replace(":productionRunId", encodeURIComponent(productionRunId))
          .replace(":productionOrderId", encodeURIComponent(productionOrderId)),
        body,
      },
      automaticProductionOrderPlacementResultSchema
    )
}

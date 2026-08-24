import type {
  ExactProductionOrderPlacementResult,
  PlaceProductionOrderExactlyCommand,
} from "@pressly/production-system/contracts/read-models/production-order-placement"

export type PlaceOrderExactlyClientOperation = Readonly<{
  operationId: "production.place-order-exactly.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    place: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type PlaceOrderExactlyClient = (
  request: PlaceProductionOrderExactlyCommand
) => Promise<ExactProductionOrderPlacementResult>

import type {
  AutomaticProductionOrderPlacementResult,
  PlaceProductionOrderAutomaticallyCommand,
} from "@pressly/production-system/contracts/read-models/production-order-placement"

export type PlaceOrderAutomaticallyClientOperation = Readonly<{
  operationId: "production.place-order-automatically.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    place: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type PlaceOrderAutomaticallyClient = (
  request: PlaceProductionOrderAutomaticallyCommand
) => Promise<AutomaticProductionOrderPlacementResult>

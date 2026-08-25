import type {
  ChangeProductionOrderResolutionCommand,
  ChangeProductionOrderResolutionResult,
} from "@pressly/production-system/contracts/demand/change-order-resolution"

export type ChangeOrderResolutionRequest = Readonly<{
  locationId: string
  productionOrderId: string
  request: Omit<
    ChangeProductionOrderResolutionCommand,
    "locationId" | "orderId"
  >
}>

export type ChangeOrderResolutionClientOperation = Readonly<{
  operationId: "production.change-order-resolution.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    resolution: Readonly<{ method: "PUT"; path: string }>
  }>
}>

export type ChangeOrderResolutionClient = (
  request: ChangeOrderResolutionRequest
) => Promise<ChangeProductionOrderResolutionResult>

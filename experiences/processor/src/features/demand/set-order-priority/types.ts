import type { ProductionMutationResult } from "@pressly/production-system/contracts/demand/set-order-priority"

export type SetOrderPriorityRequest = Readonly<{
  locationId: string
  productionOrderId: string
  priority: boolean
  expectedVersion: number
  idempotencyKey: string
}>

export type SetOrderPriorityClientOperation = Readonly<{
  operationId: "production.set-order-priority.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    priority: Readonly<{ method: "PATCH"; path: string }>
  }>
}>

export type SetOrderPriorityClient = (
  request: SetOrderPriorityRequest
) => Promise<ProductionMutationResult>

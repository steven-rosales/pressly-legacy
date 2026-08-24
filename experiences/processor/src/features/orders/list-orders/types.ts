import type {
  ListProductionOrdersQuery,
  ListProductionOrdersResult,
} from "@pressly/production-system/contracts/orders/list-orders"

export type ListOrdersQuery = Readonly<{
  status?: ListProductionOrdersQuery["status"]
  dueAfter?: ListProductionOrdersQuery["dueAfter"]
  dueBefore?: ListProductionOrdersQuery["dueBefore"]
  cursor?: ListProductionOrdersQuery["cursor"]
  limit?: number
}>

export type ListOrdersRequest = Readonly<{
  locationId: string
  query?: ListOrdersQuery
  signal?: AbortSignal
}>

export type ListOrdersClientOperation = Readonly<{
  operationId: "production.list-orders.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    orders: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type ListOrdersClient = (
  request: ListOrdersRequest
) => Promise<ListProductionOrdersResult>

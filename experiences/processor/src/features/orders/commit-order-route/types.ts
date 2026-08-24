import type {
  CommitProductionOrderRouteRequest,
  CommitProductionOrderRouteResult,
} from "@pressly/production-system/contracts/read-models/production-order-control"

export type CommitOrderRouteRequest = Readonly<{
  locationId: string
  productionRunId: string
  productionOrderId: string
  request: CommitProductionOrderRouteRequest
}>

export type CommitOrderRouteClientOperation = Readonly<{
  operationId: "production.commit-order-route.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    route: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type CommitOrderRouteClient = (
  request: CommitOrderRouteRequest
) => Promise<CommitProductionOrderRouteResult>

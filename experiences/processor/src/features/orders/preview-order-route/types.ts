import type {
  PreviewProductionOrderRouteRequest,
  ProductionOrderRouteProposal,
} from "@pressly/production-system/contracts/read-models/production-order-control"

export type PreviewOrderRouteRequest = Readonly<{
  locationId: string
  productionRunId: string
  productionOrderId: string
  request: PreviewProductionOrderRouteRequest
}>

export type PreviewOrderRouteClientOperation = Readonly<{
  operationId: "production.preview-order-route.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    preview: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type PreviewOrderRouteClient = (
  request: PreviewOrderRouteRequest
) => Promise<ProductionOrderRouteProposal>

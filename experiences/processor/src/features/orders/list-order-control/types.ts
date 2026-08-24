import type { ListProcessorOrderControlResult } from "../../../contracts/production-order-control.ts"
import type { ListProductionOrderControlQuery } from "@pressly/production-system/contracts/read-models/production-order-control"

export type ListProductionOrderControlRequest = Readonly<{
  locationId: string
  query: ListProductionOrderControlQuery
  signal?: AbortSignal
}>

export type ListProductionOrderControlClientOperation = Readonly<{
  operationId: "processor.list-production-order-control.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    "order-control": Readonly<{ method: "GET"; path: string }>
  }>
}>

export type ListProductionOrderControlClient = (
  request: ListProductionOrderControlRequest
) => Promise<ListProcessorOrderControlResult>

import type { ProcessorProductionOrderBacklogPreview } from "../../../contracts/production-order-backlog.ts"
import type { PreviewProductionOrderBacklogCommand } from "@pressly/production-system/contracts/read-models/production-order-backlog"

export type PreviewProductionOrderBacklogRequest = Omit<
  PreviewProductionOrderBacklogCommand,
  "locationId"
>

export type PreviewProductionOrderBacklogClientRequest = Readonly<{
  locationId: string
  request: PreviewProductionOrderBacklogRequest
}>

export type PreviewProductionOrderBacklogClientOperation = Readonly<{
  operationId: "processor.preview-production-order-backlog.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    preview: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type PreviewProductionOrderBacklogClient = (
  request: PreviewProductionOrderBacklogClientRequest
) => Promise<ProcessorProductionOrderBacklogPreview>

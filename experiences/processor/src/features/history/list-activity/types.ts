import type { ProcessorListProductionHistoryActivityResult } from "../../../contracts/production-history.ts"
import type { ListProductionHistoryActivityQuery } from "@pressly/production-system/contracts/read-models/production-history"

export type ListProductionHistoryActivityRequest = Readonly<{
  locationId: string
  query: ListProductionHistoryActivityQuery
  signal?: AbortSignal
}>

export type ListProductionHistoryActivityClientOperation = Readonly<{
  operationId: "processor.list-production-history-activity.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    activity: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type ListProductionHistoryActivityClient = (
  request: ListProductionHistoryActivityRequest
) => Promise<ProcessorListProductionHistoryActivityResult>

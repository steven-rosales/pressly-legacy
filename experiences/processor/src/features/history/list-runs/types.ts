import type {
  ListProductionHistoryRunsQuery,
  ListProductionHistoryRunsResult,
} from "@pressly/production-system/contracts/read-models/production-history"

export type ListHistoryRunsRequest = Readonly<{
  locationId: string
  query: ListProductionHistoryRunsQuery
  signal?: AbortSignal
}>

export type ListHistoryRunsClientOperation = Readonly<{
  operationId: "production.list-history-runs.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    runs: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type ListHistoryRunsClient = (
  request: ListHistoryRunsRequest
) => Promise<ListProductionHistoryRunsResult>

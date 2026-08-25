import type {
  ListProductionHistoryPlansQuery,
  ListProductionHistoryPlansResult,
} from "@pressly/production-system/contracts/read-models/production-history"

export type ListHistoryPlansRequest = Readonly<{
  locationId: string
  query: ListProductionHistoryPlansQuery
  signal?: AbortSignal
}>

export type ListHistoryPlansClientOperation = Readonly<{
  operationId: "production.list-history-plans.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    plans: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type ListHistoryPlansClient = (
  request: ListHistoryPlansRequest
) => Promise<ListProductionHistoryPlansResult>

import type { ProcessorProductionHistoryRunDetail } from "../../../contracts/production-history.ts"

export type LoadProductionHistoryRunClientOperation = Readonly<{
  operationId: "processor.load-production-history-run.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    request: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type LoadProductionHistoryRunClient = (
  locationId: string,
  productionRunId: string,
  signal?: AbortSignal
) => Promise<ProcessorProductionHistoryRunDetail>

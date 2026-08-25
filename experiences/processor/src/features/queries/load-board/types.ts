import type { ProcessorProductionBoard } from "../../../contracts/production-board.ts"

export type LoadProductionBoardClientOperation = Readonly<{
  operationId: "processor.load-production-board.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    board: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type LoadProductionBoardClient = (
  locationId: string,
  productionRunId: string,
  signal?: AbortSignal
) => Promise<ProcessorProductionBoard>

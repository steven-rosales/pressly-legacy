import type {
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
} from "@pressly/production-system/contracts/read-models/production-order-backlog"

export type CommitOrderBacklogRequest = Readonly<{
  locationId: string
  request: Omit<CommitProductionOrderBacklogCommand, "locationId">
}>

export type CommitOrderBacklogClientOperation = Readonly<{
  operationId: "production.commit-order-backlog.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    "order-backlog": Readonly<{ method: "POST"; path: string }>
  }>
}>

export type CommitOrderBacklogClient = (
  request: CommitOrderBacklogRequest
) => Promise<ProductionOrderBacklogCommitResult>

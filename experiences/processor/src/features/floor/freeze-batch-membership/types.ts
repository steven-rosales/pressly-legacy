import type { ProductionBatchMembershipMutationResult } from "@pressly/production-system/contracts/floor/freeze-batch-membership"

export type FreezeBatchMembershipRequest = Readonly<{
  locationId: string
  productionRunId: string
  productionBatchId: string
  expectedQueueVersion: number
  expectedBatchVersion: number
  idempotencyKey: string
}>

export type FreezeBatchMembershipClientOperation = Readonly<{
  operationId: "production.freeze-batch-membership.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    freeze: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type FreezeBatchMembershipClient = (
  request: FreezeBatchMembershipRequest
) => Promise<ProductionBatchMembershipMutationResult>

export type FreezeBatchMembershipWorkflowIntent = Omit<
  FreezeBatchMembershipRequest,
  "idempotencyKey"
>

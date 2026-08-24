import type { ProductionBatchMembershipMutationResult } from "@pressly/production-system/contracts/floor/unfreeze-batch-membership"

export type UnfreezeBatchMembershipRequest = Readonly<{
  locationId: string
  productionRunId: string
  productionBatchId: string
  expectedQueueVersion: number
  expectedBatchVersion: number
  idempotencyKey: string
}>

export type UnfreezeBatchMembershipClientOperation = Readonly<{
  operationId: "production.unfreeze-batch-membership.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    unfreeze: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type UnfreezeBatchMembershipClient = (
  request: UnfreezeBatchMembershipRequest
) => Promise<ProductionBatchMembershipMutationResult>

export type UnfreezeBatchMembershipWorkflowIntent = Omit<
  UnfreezeBatchMembershipRequest,
  "idempotencyKey"
>

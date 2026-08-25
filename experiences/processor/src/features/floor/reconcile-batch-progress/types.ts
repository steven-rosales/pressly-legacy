import type {
  ProductionBatchProgressReconciliationResult,
  ReconcileProductionBatchProgressCommand,
} from "@pressly/production-system/contracts/floor/reconcile-batch-progress"

export type ReconcileBatchProgressRequest = Readonly<{
  locationId: string
  productionRunId: string
  productionBatchId: string
  expectedQueueVersion: number
  expectedBatchVersion: number
  expectedStageVersions: readonly Readonly<{
    stageRunId: string
    version: number
  }>[]
  target: ReconcileProductionBatchProgressCommand["target"]
  reason: ReconcileProductionBatchProgressCommand["reason"]
  note?: string
  machineIds: readonly string[]
  confirmation?: NonNullable<
    ReconcileProductionBatchProgressCommand["confirmation"]
  >
  idempotencyKey: string
}>

export type ReconcileBatchProgressClientOperation = Readonly<{
  operationId: "production.reconcile-batch-progress.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    "progress-reconciliation": Readonly<{
      method: "POST"
      path: string
    }>
  }>
}>

export type ReconcileBatchProgressClient = (
  request: ReconcileBatchProgressRequest
) => Promise<ProductionBatchProgressReconciliationResult>

type ReconcileBatchProgressWorkflowScope = Omit<
  ReconcileBatchProgressRequest,
  "confirmation" | "idempotencyKey"
>

export type ReconcileBatchProgressWorkflowIntent =
  | (ReconcileBatchProgressWorkflowScope & Readonly<{ kind: "preview" }>)
  | (ReconcileBatchProgressWorkflowScope &
      Readonly<{
        kind: "confirmation"
        confirmation: NonNullable<ReconcileBatchProgressRequest["confirmation"]>
      }>)

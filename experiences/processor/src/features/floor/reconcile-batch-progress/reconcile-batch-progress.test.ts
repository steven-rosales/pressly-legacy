import {
  productionBatchProgressReconciliationResultSchema,
  type ProductionBatchProgressReconciliationResult,
} from "@pressly/production-system/contracts/floor/reconcile-batch-progress"
import { describe, expect, it, vi } from "vitest"
import {
  makeReconcileBatchProgressClient,
  type ReconcileBatchProgressRequestTransport,
} from "./client.ts"
import { makeReconcileBatchProgressWorkflow } from "./workflow.ts"
import type { ReconcileBatchProgressClientOperation } from "./types.ts"

const operation: ReconcileBatchProgressClientOperation = {
  operationId: "production.reconcile-batch-progress.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    "progress-reconciliation": {
      method: "POST",
      path: "/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation",
    },
  },
}

const stageVersions = [
  {
    stageRunId: "11111111-1111-4111-8111-111111111111",
    version: 1,
  },
  {
    stageRunId: "22222222-2222-4222-8222-222222222222",
    version: 1,
  },
  {
    stageRunId: "33333333-3333-4333-8333-333333333333",
    version: 1,
  },
  {
    stageRunId: "44444444-4444-4444-8444-444444444444",
    version: 1,
  },
] as const

const result: ProductionBatchProgressReconciliationResult = {
  status: "confirmation_required",
  productionRunId: "55555555-5555-4555-8555-555555555555",
  productionBatchId: "66666666-6666-4666-8666-666666666666",
  currentMilestone: "waiting_to_sort",
  targetMilestone: "sorting_started",
  queueVersion: 2,
  batchVersion: 3,
  stageVersions: [...stageVersions],
  confirmation: { proposalHash: "a".repeat(64) },
  effects: {
    completedStages: [],
    activeStage: "sorting",
    finishesBatch: false,
    finishesRun: false,
    closesShift: false,
  },
  replayed: false,
}

const scope = {
  locationId: "location/one",
  productionRunId: "run two",
  productionBatchId: "batch three",
  expectedQueueVersion: 2,
  expectedBatchVersion: 3,
  expectedStageVersions: stageVersions,
  target: "sorting_started" as const,
  reason: "updates_missed" as const,
  machineIds: [] as const,
}

describe("Processor reconcile-batch-progress experience", () => {
  it("maps the typed command body through generated route metadata", async () => {
    const request = vi
      .fn<ReconcileBatchProgressRequestTransport>()
      .mockResolvedValue(result)
    const reconcileBatchProgress = makeReconcileBatchProgressClient({
      operation,
      request,
    })

    await expect(
      reconcileBatchProgress({
        ...scope,
        idempotencyKey: "reconcile-batch-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/locations/location%2Fone/runs/run%20two/batches/batch%20three/progress-reconciliation",
        body: {
          expectedQueueVersion: 2,
          expectedBatchVersion: 3,
          expectedStageVersions: stageVersions,
          target: "sorting_started",
          reason: "updates_missed",
          machineIds: [],
          idempotencyKey: "reconcile-batch-key",
        },
      },
      productionBatchProgressReconciliationResultSchema
    )
  })

  it("owns distinct preview and confirmation idempotency envelopes", async () => {
    const makeIdempotencyKey = vi
      .fn()
      .mockResolvedValueOnce("preview-key")
      .mockResolvedValueOnce("confirmation-key")
    const execute = vi.fn().mockResolvedValue(result)
    const reconcileBatchProgress = makeReconcileBatchProgressWorkflow({
      execute,
      makeIdempotencyKey,
    })

    await reconcileBatchProgress({ kind: "preview", ...scope })
    const confirmed = {
      kind: "confirmation" as const,
      ...scope,
      confirmation: result.confirmation,
    }
    await reconcileBatchProgress(confirmed)

    expect(makeIdempotencyKey).toHaveBeenNthCalledWith(1, {
      operation: "review-production-batch-progress-reconciliation",
      payload: scope,
    })
    expect(makeIdempotencyKey).toHaveBeenNthCalledWith(2, {
      operation: "confirm-production-batch-progress-reconciliation",
      payload: {
        ...scope,
        confirmation: result.confirmation,
      },
    })
    expect(execute).toHaveBeenNthCalledWith(1, {
      ...scope,
      idempotencyKey: "preview-key",
    })
    expect(execute).toHaveBeenNthCalledWith(2, {
      ...scope,
      confirmation: result.confirmation,
      idempotencyKey: "confirmation-key",
    })
  })
})

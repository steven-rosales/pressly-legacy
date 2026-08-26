import {
  productionBatchMembershipMutationResultSchema,
  type ProductionBatchMembershipMutationResult,
} from "@pressly/production-system/contracts/floor/unfreeze-batch-membership"
import { describe, expect, it, vi } from "vitest"
import {
  makeUnfreezeBatchMembershipClient,
  type UnfreezeBatchMembershipRequestTransport,
} from "./client.ts"
import { makeUnfreezeBatchMembershipWorkflow } from "./workflow.ts"
import type { UnfreezeBatchMembershipClientOperation } from "./types.ts"

const operation: UnfreezeBatchMembershipClientOperation = {
  operationId: "production.unfreeze-batch-membership.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    unfreeze: {
      method: "POST",
      path: "/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze",
    },
  },
}

const result: ProductionBatchMembershipMutationResult = {
  productionRunId: "11111111-1111-4111-8111-111111111111",
  productionBatchId: "22222222-2222-4222-8222-222222222222",
  queueVersion: 3,
  batchVersion: 4,
  membership: { state: "mutable" },
  replayed: false,
}

describe("Processor unfreeze-batch-membership experience", () => {
  it("maps the typed command body through declared route metadata", async () => {
    const request = vi
      .fn<UnfreezeBatchMembershipRequestTransport>()
      .mockResolvedValue(result)
    const unfreezeBatch = makeUnfreezeBatchMembershipClient({
      operation,
      request,
    })

    await expect(
      unfreezeBatch({
        locationId: "location/one",
        productionRunId: "run two",
        productionBatchId: "batch three",
        expectedQueueVersion: 2,
        expectedBatchVersion: 3,
        idempotencyKey: "unfreeze-batch-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/locations/location%2Fone/runs/run%20two/batches/batch%20three/unfreeze",
        body: {
          expectedQueueVersion: 2,
          expectedBatchVersion: 3,
          idempotencyKey: "unfreeze-batch-key",
        },
      },
      productionBatchMembershipMutationResultSchema
    )
  })

  it("owns the existing unfreeze idempotency identity and payload", async () => {
    const makeIdempotencyKey = vi.fn().mockResolvedValue("unfreeze-key")
    const execute = vi.fn().mockResolvedValue(result)
    const unfreezeBatch = makeUnfreezeBatchMembershipWorkflow({
      execute,
      makeIdempotencyKey,
    })
    const intent = {
      locationId: "location-1",
      productionRunId: "run-1",
      productionBatchId: "batch-1",
      expectedQueueVersion: 2,
      expectedBatchVersion: 3,
    } as const

    await expect(unfreezeBatch(intent)).resolves.toEqual(result)

    expect(makeIdempotencyKey).toHaveBeenCalledWith({
      operation: "unfreeze-production-batch",
      payload: {
        productionRunId: "run-1",
        productionBatchId: "batch-1",
        expectedQueueVersion: 2,
        expectedBatchVersion: 3,
      },
    })
    expect(execute).toHaveBeenCalledWith({
      ...intent,
      idempotencyKey: "unfreeze-key",
    })
  })
})

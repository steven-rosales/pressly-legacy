import {
  productionBatchMembershipMutationResultSchema,
  type ProductionBatchMembershipMutationResult,
} from "@pressly/production-system/contracts/floor/freeze-batch-membership"
import { describe, expect, it, vi } from "vitest"
import {
  makeFreezeBatchMembershipClient,
  type FreezeBatchMembershipRequestTransport,
} from "./client.ts"
import { makeFreezeBatchMembershipWorkflow } from "./workflow.ts"
import type { FreezeBatchMembershipClientOperation } from "./types.ts"

const operation: FreezeBatchMembershipClientOperation = {
  operationId: "production.freeze-batch-membership.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    freeze: {
      method: "POST",
      path: "/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze",
    },
  },
}

const result: ProductionBatchMembershipMutationResult = {
  productionRunId: "11111111-1111-4111-8111-111111111111",
  productionBatchId: "22222222-2222-4222-8222-222222222222",
  queueVersion: 3,
  batchVersion: 4,
  membership: {
    state: "frozen",
    frozenAt: "2026-08-21T14:00:00.000Z",
    frozenBy: "33333333-3333-4333-8333-333333333333",
  },
  replayed: false,
}

describe("Processor freeze-batch-membership experience", () => {
  it("maps the typed command body through declared route metadata", async () => {
    const request = vi
      .fn<FreezeBatchMembershipRequestTransport>()
      .mockResolvedValue(result)
    const freezeBatch = makeFreezeBatchMembershipClient({
      operation,
      request,
    })

    await expect(
      freezeBatch({
        locationId: "location/one",
        productionRunId: "run two",
        productionBatchId: "batch three",
        expectedQueueVersion: 2,
        expectedBatchVersion: 3,
        idempotencyKey: "freeze-batch-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/locations/location%2Fone/runs/run%20two/batches/batch%20three/freeze",
        body: {
          expectedQueueVersion: 2,
          expectedBatchVersion: 3,
          idempotencyKey: "freeze-batch-key",
        },
      },
      productionBatchMembershipMutationResultSchema
    )
  })

  it("owns the existing freeze idempotency identity and payload", async () => {
    const makeIdempotencyKey = vi.fn().mockResolvedValue("freeze-key")
    const execute = vi.fn().mockResolvedValue(result)
    const freezeBatch = makeFreezeBatchMembershipWorkflow({
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

    await expect(freezeBatch(intent)).resolves.toEqual(result)

    expect(makeIdempotencyKey).toHaveBeenCalledWith({
      operation: "freeze-production-batch",
      payload: {
        productionRunId: "run-1",
        productionBatchId: "batch-1",
        expectedQueueVersion: 2,
        expectedBatchVersion: 3,
      },
    })
    expect(execute).toHaveBeenCalledWith({
      ...intent,
      idempotencyKey: "freeze-key",
    })
  })
})

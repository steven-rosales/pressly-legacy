import {
  commitProductionOrderRouteRequestSchema,
  commitProductionOrderRouteResultSchema,
  type CommitProductionOrderRouteResult,
  type ProductionOrderRouteProposal,
} from "@pressly/production-system/contracts/read-models/production-order-control"
import { describe, expect, it, vi } from "vitest"
import {
  makeCommitOrderRouteClient,
  type CommitOrderRouteRequestTransport,
} from "./client.ts"
import type { CommitOrderRouteClientOperation } from "./types.ts"

const operation: CommitOrderRouteClientOperation = {
  operationId: "production.commit-order-route.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    route: {
      method: "POST",
      path: "/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route",
    },
  },
}

const proposal: ProductionOrderRouteProposal = {
  kind: "queued_move",
  productionRunId: "41000000-0000-4000-8000-000000000001",
  productionOrderId: "41000000-0000-4000-8000-000000000002",
  sourceProductionBatchId: "41000000-0000-4000-8000-000000000003",
  sourceBatchSequence: 0,
  targetProductionBatchId: "41000000-0000-4000-8000-000000000004",
  targetBatchSequence: 1,
  restartStage: "sorting",
  releasedStages: ["sorting"],
  assignedStages: ["sorting", "washing", "drying", "folding_packaging"],
  orderWeightLbs: 25,
  targetWeightLbs: 75,
  targetCapacityLbs: 100,
  expectedQueueVersion: 2,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 4,
  expectedTargetBatchVersion: 5,
  proposalHash: "a".repeat(64),
}

const result: CommitProductionOrderRouteResult = {
  status: "routed",
  proposal,
  queueVersion: 3,
  orderVersion: 4,
  sourceBatchVersion: 5,
  targetBatchVersion: 6,
  createdAttemptIds: ["41000000-0000-4000-8000-000000000005"],
  replayed: false,
}

describe("Processor commit-order-route experience", () => {
  it("preserves the canonical command and result through declared route metadata", async () => {
    const request = vi
      .fn<CommitOrderRouteRequestTransport>()
      .mockResolvedValue(result)
    const commit = makeCommitOrderRouteClient({ operation, request })
    const body = commitProductionOrderRouteRequestSchema.parse({
      kind: "queued_move",
      reason: "manual_rebatch",
      targetProductionBatchId: proposal.targetProductionBatchId,
      restartStage: proposal.restartStage,
      expectedQueueVersion: proposal.expectedQueueVersion,
      expectedOrderVersion: proposal.expectedOrderVersion,
      expectedSourceBatchVersion: proposal.expectedSourceBatchVersion,
      proposalHash: proposal.proposalHash,
      idempotencyKey: "commit-order-route-command-1",
    })

    await expect(
      commit({
        locationId: "pressly one/north",
        productionRunId: "run two/east",
        productionOrderId: "order three west",
        request: body,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: operation.http.route.method,
        path: "/production/locations/pressly%20one%2Fnorth/runs/run%20two%2Feast/orders/order%20three%20west/route",
        body,
      },
      commitProductionOrderRouteResultSchema
    )
  })
})

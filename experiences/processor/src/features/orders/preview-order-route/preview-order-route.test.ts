import {
  productionOrderRouteProposalSchema,
  type ProductionOrderRouteProposal,
} from "@pressly/production-system/contracts/read-models/production-order-control"
import { describe, expect, it, vi } from "vitest"
import {
  makePreviewOrderRouteClient,
  type PreviewOrderRouteRequestTransport,
} from "./client.ts"
import type { PreviewOrderRouteClientOperation } from "./types.ts"

const operation: PreviewOrderRouteClientOperation = {
  operationId: "production.preview-order-route.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    preview: {
      method: "POST",
      path: "/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview",
    },
  },
}

const result: ProductionOrderRouteProposal = {
  kind: "queued_move",
  productionRunId: "11111111-1111-4111-8111-111111111111",
  productionOrderId: "22222222-2222-4222-8222-222222222222",
  sourceProductionBatchId: "33333333-3333-4333-8333-333333333333",
  sourceBatchSequence: 0,
  targetProductionBatchId: "44444444-4444-4444-8444-444444444444",
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

describe("Processor preview-order-route experience", () => {
  it("preserves the preview body and response schema through declared route metadata", async () => {
    const request = vi
      .fn<PreviewOrderRouteRequestTransport>()
      .mockResolvedValue(result)
    const previewOrderRoute = makePreviewOrderRouteClient({
      operation,
      request,
    })
    const body = {
      kind: "queued_move" as const,
      reason: "manual_rebatch" as const,
      targetProductionBatchId: result.targetProductionBatchId,
      restartStage: "sorting" as const,
      expectedQueueVersion: 2,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 4,
    }

    await expect(
      previewOrderRoute({
        locationId: "location/one",
        productionRunId: "run two",
        productionOrderId: "order three",
        request: body,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/production/locations/location%2Fone/runs/run%20two/orders/order%20three/route/preview",
        body,
      },
      productionOrderRouteProposalSchema
    )
  })
})

import { exactProductionOrderPlacementResultSchema } from "@pressly/production-system/contracts/read-models/production-order-placement"
import { describe, expect, it, vi } from "vitest"
import { makePlaceOrderExactlyClient } from "./client.ts"

describe("Processor exact-placement client", () => {
  it("maps every identity segment and leaves only the exact body", async () => {
    const result = {
      status: "not_placed" as const,
      mode: "manager_exact" as const,
      productionRunId: "run-1",
      productionOrderId: "order-1",
      reason: "no_mutable_position" as const,
      message: "Frozen.",
      queueVersion: 4,
      replayed: false as const,
    }
    const request = vi.fn(async () => result)
    const client = makePlaceOrderExactlyClient({
      operation: {
        operationId: "production.place-order-exactly.v1",
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          place: {
            method: "POST",
            path: "/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place",
          },
        },
      },
      request,
    })

    await expect(
      client({
        locationId: "location/one",
        productionRunId: "run/one",
        productionBatchId: "batch/one",
        productionOrderId: "order/one",
        expectedQueueVersion: 4,
        expectedBatchVersion: 2,
        idempotencyKey: "exact-1",
      })
    ).resolves.toEqual(result)
    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/production/locations/location%2Fone/runs/run%2Fone/batches/batch%2Fone/orders/order%2Fone/place",
        body: {
          expectedQueueVersion: 4,
          expectedBatchVersion: 2,
          idempotencyKey: "exact-1",
        },
      },
      exactProductionOrderPlacementResultSchema
    )
  })
})

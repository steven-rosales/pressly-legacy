import { automaticProductionOrderPlacementResultSchema } from "@pressly/production-system/contracts/read-models/production-order-placement"
import { describe, expect, it, vi } from "vitest"
import { makePlaceOrderAutomaticallyClient } from "./client.ts"

describe("Processor automatic-placement client", () => {
  it("uses only generated method/path metadata and the owning wire schema", async () => {
    const result = {
      status: "not_placed" as const,
      mode: "automatic" as const,
      productionRunId: "run-1",
      productionOrderId: "order-1",
      reason: "queue_conflict" as const,
      message: "Queue changed.",
      queueVersion: 5,
      replayed: false as const,
    }
    const request = vi.fn(async () => result)
    const client = makePlaceOrderAutomaticallyClient({
      operation: {
        operationId: "production.place-order-automatically.v1",
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          place: {
            method: "POST",
            path: "/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place",
          },
        },
      },
      request,
    })

    await expect(
      client({
        locationId: "location / one",
        productionRunId: "run / one",
        productionOrderId: "order / one",
        expectedQueueVersion: 4,
        idempotencyKey: "automatic-1",
      })
    ).resolves.toEqual(result)
    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/production/locations/location%20%2F%20one/runs/run%20%2F%20one/orders/order%20%2F%20one/place",
        body: {
          expectedQueueVersion: 4,
          idempotencyKey: "automatic-1",
        },
      },
      automaticProductionOrderPlacementResultSchema
    )
  })
})

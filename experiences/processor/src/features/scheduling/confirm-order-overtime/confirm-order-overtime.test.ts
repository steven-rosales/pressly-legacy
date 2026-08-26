import { confirmProductionOrderOvertimeResultSchema } from "@pressly/production-system/contracts/read-models/production-order-placement"
import { describe, expect, it, vi } from "vitest"
import { makeConfirmOrderOvertimeClient } from "./client.ts"

describe("Processor overtime-confirmation client", () => {
  it("uses declared confirm-overtime metadata and preserves the proposal fence", async () => {
    const result = {
      status: "not_placed" as const,
      mode: "automatic" as const,
      productionRunId: "run-1",
      productionOrderId: "order-1",
      reason: "proposal_stale" as const,
      message: "Stale.",
      queueVersion: 5,
      replayed: false as const,
    }
    const request = vi.fn(async () => result)
    const client = makeConfirmOrderOvertimeClient({
      operation: {
        operationId: "production.confirm-order-overtime.v1",
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          "confirm-overtime": {
            method: "POST",
            path: "/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime",
          },
        },
      },
      request,
    })
    const proposalHash = "a".repeat(64)

    await expect(
      client({
        locationId: "location/one",
        productionRunId: "run/one",
        productionOrderId: "order/one",
        expectedQueueVersion: 4,
        proposalHash,
        idempotencyKey: "confirm-1",
      })
    ).resolves.toEqual(result)
    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/production/locations/location%2Fone/runs/run%2Fone/orders/order%2Fone/confirm-overtime",
        body: {
          expectedQueueVersion: 4,
          proposalHash,
          idempotencyKey: "confirm-1",
        },
      },
      confirmProductionOrderOvertimeResultSchema
    )
  })
})

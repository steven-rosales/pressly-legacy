import {
  changeProductionOrderResolutionResultSchema,
  type ChangeProductionOrderResolutionResult,
} from "@pressly/production-system/contracts/demand/change-order-resolution"
import { describe, expect, it, vi } from "vitest"
import {
  makeChangeOrderResolutionClient,
  type ChangeOrderResolutionRequestTransport,
} from "./client.ts"
import type { ChangeOrderResolutionClientOperation } from "./types.ts"

const operation: ChangeOrderResolutionClientOperation = {
  operationId: "production.change-order-resolution.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    resolution: {
      method: "PUT",
      path: "/production/locations/:locationId/orders/:productionOrderId/resolution",
    },
  },
}

const result: ChangeProductionOrderResolutionResult = {
  locationId: "location/one",
  orderId: "order two",
  action: "resolve_without_production",
  resolutionState: "resolved_without_production",
  transitionedAt: "2026-08-22T12:00:00.000Z",
  version: 4,
  replayed: false,
}

describe("Processor change-order-resolution experience", () => {
  it("maps the unchanged command body through declared metadata", async () => {
    const request = vi
      .fn<ChangeOrderResolutionRequestTransport>()
      .mockResolvedValue(result)
    const changeResolution = makeChangeOrderResolutionClient({
      operation,
      request,
    })
    const body = {
      action: "resolve_without_production" as const,
      reason: "processor_not_in_use" as const,
      note: null,
      confirmReviewedFacts: false,
      expectedVersion: 3,
      idempotencyKey: "change-resolution-key",
    }

    await expect(
      changeResolution({
        locationId: "location/one",
        productionOrderId: "order two",
        request: body,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "PUT",
        path: "/production/locations/location%2Fone/orders/order%20two/resolution",
        body,
      },
      changeProductionOrderResolutionResultSchema
    )
  })
})

import {
  productionMutationResultSchema,
  type ProductionMutationResult,
} from "@pressly/production-system/contracts/demand/set-order-priority"
import { describe, expect, it, vi } from "vitest"
import {
  makeSetOrderPriorityClient,
  type SetOrderPriorityRequestTransport,
} from "./client.ts"
import type { SetOrderPriorityClientOperation } from "./types.ts"

const operation: SetOrderPriorityClientOperation = {
  operationId: "production.set-order-priority.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    priority: {
      method: "PATCH",
      path: "/production/locations/:locationId/orders/:productionOrderId/priority",
    },
  },
}

const result: ProductionMutationResult = {
  entityId: "11111111-1111-4111-8111-111111111111",
  version: 4,
  replayed: false,
}

describe("Processor set-order-priority experience", () => {
  it("maps the unchanged command body through the declared route", async () => {
    const request = vi
      .fn<SetOrderPriorityRequestTransport>()
      .mockResolvedValue(result)
    const setPriority = makeSetOrderPriorityClient({ operation, request })

    await expect(
      setPriority({
        locationId: "location/one",
        productionOrderId: "order two",
        priority: true,
        expectedVersion: 3,
        idempotencyKey: "set-priority-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "PATCH",
        path: "/production/locations/location%2Fone/orders/order%20two/priority",
        body: {
          priority: true,
          expectedVersion: 3,
          idempotencyKey: "set-priority-key",
        },
      },
      productionMutationResultSchema
    )
  })
})

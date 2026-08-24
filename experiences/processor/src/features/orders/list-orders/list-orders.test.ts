import {
  listProductionOrdersResultSchema,
  type ListProductionOrdersResult,
} from "@pressly/production-system/contracts/orders/list-orders"
import { describe, expect, it, vi } from "vitest"
import {
  makeListOrdersClient,
  type ListOrdersRequestTransport,
} from "./client.ts"
import type { ListOrdersClientOperation } from "./types.ts"

const operation: ListOrdersClientOperation = {
  operationId: "production.list-orders.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    orders: {
      method: "GET",
      path: "/production/locations/:locationId/orders",
    },
  },
}

const result: ListProductionOrdersResult = {
  items: [],
  nextCursor: null,
  asOf: "2026-08-21T14:00:00.000Z",
}

describe("Processor list-orders experience", () => {
  it("retains the browser limit default and serializes every cursor/filter field", async () => {
    const request = vi
      .fn<ListOrdersRequestTransport>()
      .mockResolvedValue(result)
    const listOrders = makeListOrdersClient({ operation, request })
    const controller = new AbortController()

    await expect(listOrders({ locationId: "location/one" })).resolves.toEqual(
      result
    )
    await expect(
      listOrders({
        locationId: "location/one",
        query: {
          limit: 25,
          status: "scheduled",
          dueAfter: "2026-08-20T14:00:00.000Z",
          dueBefore: "2026-08-22T14:00:00.000Z",
          cursor: "next cursor & page",
        },
        signal: controller.signal,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenNthCalledWith(
      1,
      {
        method: "GET",
        path: "/production/locations/location%2Fone/orders?limit=100",
      },
      listProductionOrdersResultSchema
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      {
        method: "GET",
        path: "/production/locations/location%2Fone/orders?limit=25&status=scheduled&dueAfter=2026-08-20T14%3A00%3A00.000Z&dueBefore=2026-08-22T14%3A00%3A00.000Z&cursor=next+cursor+%26+page",
        signal: controller.signal,
      },
      listProductionOrdersResultSchema
    )
  })
})

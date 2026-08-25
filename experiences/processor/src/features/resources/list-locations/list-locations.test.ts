import {
  listProductionLocationsResultSchema,
  type ListProductionLocationsResult,
} from "@pressly/production-system/contracts/resources/list-locations"
import { describe, expect, it, vi } from "vitest"
import {
  makeListLocationsClient,
  type ListLocationsRequestTransport,
} from "./client.ts"
import type { ListLocationsClientOperation } from "./types.ts"

const operation: ListLocationsClientOperation = {
  operationId: "production.list-locations.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    locations: { method: "GET", path: "/production/locations" },
  },
}

const result: ListProductionLocationsResult = {
  items: [],
  asOf: "2026-08-21T14:00:00.000Z",
}

describe("Processor list-locations experience", () => {
  it("preserves the omitted default query and maps explicit filtering and cancellation", async () => {
    const request = vi
      .fn<ListLocationsRequestTransport>()
      .mockResolvedValue(result)
    const listLocations = makeListLocationsClient({ operation, request })
    const controller = new AbortController()

    await expect(listLocations()).resolves.toEqual(result)
    await expect(
      listLocations({
        query: { includeInactive: true },
        signal: controller.signal,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenNthCalledWith(
      1,
      { method: "GET", path: "/production/locations" },
      listProductionLocationsResultSchema
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      {
        method: "GET",
        path: "/production/locations?includeInactive=true",
        signal: controller.signal,
      },
      listProductionLocationsResultSchema
    )
  })
})

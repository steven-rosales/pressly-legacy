import {
  listProductionHistoryPlansResultSchema,
  type ListProductionHistoryPlansResult,
} from "@pressly/production-system/contracts/read-models/production-history"
import { describe, expect, it, vi } from "vitest"
import {
  makeListHistoryPlansClient,
  type ListHistoryPlansRequestTransport,
} from "./client.ts"
import type { ListHistoryPlansClientOperation } from "./types.ts"

const operation: ListHistoryPlansClientOperation = {
  operationId: "production.list-history-plans.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    plans: {
      method: "GET",
      path: "/production/locations/:locationId/history/plans",
    },
  },
}

const result: ListProductionHistoryPlansResult = {
  items: [],
  nextCursor: null,
  asOf: "2026-08-21T14:00:00.000Z",
}

describe("Processor list-history-plans experience", () => {
  it("preserves query order, string coercion, omission, and cancellation", async () => {
    const request = vi
      .fn<ListHistoryPlansRequestTransport>()
      .mockResolvedValue(result)
    const listPlans = makeListHistoryPlansClient({ operation, request })
    const controller = new AbortController()

    await expect(
      listPlans({
        locationId: "location/one",
        query: {
          limit: 50,
          cursor: "next cursor",
          runId: "11111111-1111-4111-8111-111111111111",
          search: "north & east",
          status: "accepted",
          createdAfter: "2026-08-21T14:00:00.000Z",
        },
        signal: controller.signal,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/location%2Fone/history/plans?limit=50&cursor=next+cursor&runId=11111111-1111-4111-8111-111111111111&search=north+%26+east&status=accepted&createdAfter=2026-08-21T14%3A00%3A00.000Z",
        signal: controller.signal,
      },
      listProductionHistoryPlansResultSchema
    )
  })
})

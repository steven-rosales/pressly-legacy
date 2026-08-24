import {
  listProductionHistoryRunsResultSchema,
  type ListProductionHistoryRunsResult,
} from "@pressly/production-system/contracts/read-models/production-history"
import { describe, expect, it, vi } from "vitest"
import {
  makeListHistoryRunsClient,
  type ListHistoryRunsRequestTransport,
} from "./client.ts"
import type { ListHistoryRunsClientOperation } from "./types.ts"

const operation: ListHistoryRunsClientOperation = {
  operationId: "production.list-history-runs.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    runs: {
      method: "GET",
      path: "/production/locations/:locationId/history/runs",
    },
  },
}

const result: ListProductionHistoryRunsResult = {
  items: [],
  nextCursor: null,
  asOf: "2026-08-21T14:00:00.000Z",
}

describe("Processor list-history-runs experience", () => {
  it("preserves query order, filters, cursor bytes, and cancellation", async () => {
    const request = vi
      .fn<ListHistoryRunsRequestTransport>()
      .mockResolvedValue(result)
    const listRuns = makeListHistoryRunsClient({ operation, request })
    const controller = new AbortController()

    await expect(
      listRuns({
        locationId: "location/one",
        query: {
          limit: 50,
          cursor: "next cursor & page",
          search: "north & east",
          status: "completed",
          createdAfter: "2026-08-20T14:00:00.000Z",
        },
        signal: controller.signal,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/location%2Fone/history/runs?limit=50&cursor=next+cursor+%26+page&search=north+%26+east&status=completed&createdAfter=2026-08-20T14%3A00%3A00.000Z",
        signal: controller.signal,
      },
      listProductionHistoryRunsResultSchema
    )
  })
})

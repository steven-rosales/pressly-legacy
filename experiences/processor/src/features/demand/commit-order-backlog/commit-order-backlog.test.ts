import {
  commitProductionOrderBacklogRequestSchema,
  productionOrderBacklogCommitResultSchema,
  type ProductionOrderBacklogCommitResult,
} from "@pressly/production-system/contracts/read-models/production-order-backlog"
import { describe, expect, it, vi } from "vitest"
import {
  makeCommitOrderBacklogClient,
  type CommitOrderBacklogRequestTransport,
} from "./client.ts"
import type { CommitOrderBacklogClientOperation } from "./types.ts"

const operation: CommitOrderBacklogClientOperation = {
  operationId: "production.commit-order-backlog.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    "order-backlog": {
      method: "POST",
      path: "/production/locations/:locationId/order-backlog",
    },
  },
}

const result: ProductionOrderBacklogCommitResult = {
  locationId: "pressly one/north",
  bulkOperationId: "31000000-0000-4000-8000-000000000001",
  previewHash: "a".repeat(64),
  nextCursor: null,
  resolvedCount: 1,
  resolved: [
    {
      orderId: "31000000-0000-4000-8000-000000000002",
      resolutionState: "resolved_without_production",
      version: 4,
    },
  ],
  committedAt: "2026-08-22T16:00:00.000Z",
  replayed: false,
}

describe("Processor commit-order-backlog experience", () => {
  it("preserves the canonical command and result contracts through declared metadata", async () => {
    const request = vi
      .fn<CommitOrderBacklogRequestTransport>()
      .mockResolvedValue(result)
    const commit = makeCommitOrderBacklogClient({ operation, request })
    const body = commitProductionOrderBacklogRequestSchema.parse({
      filter: "all_due_before_cutoff",
      cutoff: "2026-08-01T00:00:00.000Z",
      reason: "processor_not_in_use",
      cursor: null,
      maxOrders: 250,
      note: null,
      previewHash: result.previewHash,
      idempotencyKey: "commit-order-backlog-command-1",
    })

    await expect(
      commit({ locationId: result.locationId, request: body })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: operation.http["order-backlog"].method,
        path: "/production/locations/pressly%20one%2Fnorth/order-backlog",
        body,
      },
      productionOrderBacklogCommitResultSchema
    )
  })
})

import {
  updateProductionShiftResultSchema,
  type UpdateProductionShiftResult,
} from "@pressly/production-system/contracts/scheduling/update-shift"
import { describe, expect, it, vi } from "vitest"
import {
  makeUpdateShiftClient,
  type UpdateShiftRequestTransport,
} from "./client.ts"
import type { UpdateShiftClientOperation } from "./types.ts"

const operation: UpdateShiftClientOperation = {
  operationId: "production.update-shift.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    request: {
      method: "PATCH",
      path: "/production/locations/:locationId/shifts/:productionShiftId",
    },
  },
}

const result: UpdateProductionShiftResult = {
  productionShift: {
    id: "10000000-0000-4000-8000-000000000001",
    locationId: "pressly one/north",
    startsAt: "2026-08-22T12:30:00.000Z",
    endsAt: "2026-08-22T22:00:00.000Z",
    timezone: "America/New_York",
    effectiveFolderCount: 4,
    status: "open",
    version: 2,
  },
  supersededScheduleRunId: "10000000-0000-4000-8000-000000000002",
  replayed: false,
}

describe("Processor update-shift experience", () => {
  it("preserves version and idempotency through declared metadata and the canonical result decoder", async () => {
    const request = vi
      .fn<UpdateShiftRequestTransport>()
      .mockResolvedValue(result)
    const updateShift = makeUpdateShiftClient({ operation, request })

    await expect(
      updateShift({
        locationId: "pressly one/north",
        productionShiftId: "shift/id",
        startsAt: result.productionShift.startsAt,
        endsAt: result.productionShift.endsAt,
        effectiveFolderCount: result.productionShift.effectiveFolderCount,
        expectedVersion: 1,
        idempotencyKey: "update-shift-command-1",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "PATCH",
        path: "/production/locations/pressly%20one%2Fnorth/shifts/shift%2Fid",
        body: {
          startsAt: result.productionShift.startsAt,
          endsAt: result.productionShift.endsAt,
          effectiveFolderCount: result.productionShift.effectiveFolderCount,
          expectedVersion: 1,
          idempotencyKey: "update-shift-command-1",
        },
      },
      updateProductionShiftResultSchema
    )
  })
})

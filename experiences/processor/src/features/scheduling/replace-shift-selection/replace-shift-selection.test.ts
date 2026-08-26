import { replaceProductionShiftSelectionResultSchema } from "@pressly/production-system/contracts/scheduling/replace-shift-selection"
import { describe, expect, it, vi } from "vitest"
import {
  makeReplaceShiftSelectionClient,
  type ReplaceShiftSelectionRequestTransport,
} from "./client.ts"
import type { ReplaceShiftSelectionClientOperation } from "./types.ts"

const operation: ReplaceShiftSelectionClientOperation = {
  operationId: "production.replace-shift-selection.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    selection: {
      method: "PUT",
      path: "/production/locations/:locationId/shifts/:productionShiftId/selection",
    },
  },
}

describe("replace shift selection client", () => {
  it("uses declared metadata and canonical result validation", async () => {
    const result = {
      selection: {
        productionShiftId: "10000000-0000-4000-8000-000000000001",
        version: 2,
        selectedOrderIds: ["10000000-0000-4000-8000-000000000002"],
      },
      supersededScheduleRunId: null,
      replayed: false,
    }
    const request = vi
      .fn<ReplaceShiftSelectionRequestTransport>()
      .mockResolvedValue(result)
    const replace = makeReplaceShiftSelectionClient({ operation, request })

    await expect(
      replace({
        locationId: "pressly one/north",
        productionShiftId: result.selection.productionShiftId,
        selectedOrderIds: result.selection.selectedOrderIds,
        expectedVersion: 1,
        idempotencyKey: "replace-selection-client-1",
      })
    ).resolves.toEqual(result)
    expect(request).toHaveBeenCalledWith(
      {
        method: "PUT",
        path: `/production/locations/pressly%20one%2Fnorth/shifts/${result.selection.productionShiftId}/selection`,
        body: {
          selectedOrderIds: result.selection.selectedOrderIds,
          expectedVersion: 1,
          idempotencyKey: "replace-selection-client-1",
        },
      },
      replaceProductionShiftSelectionResultSchema
    )
  })
})

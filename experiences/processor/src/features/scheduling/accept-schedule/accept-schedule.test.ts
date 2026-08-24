import {
  acceptScheduleRequestSchema,
  acceptScheduleResultSchema,
  type AcceptScheduleResult,
} from "@pressly/production-system/contracts/scheduling/accept-schedule"
import { describe, expect, it, vi } from "vitest"
import {
  makeAcceptScheduleClient,
  type AcceptScheduleRequestTransport,
} from "./client.ts"
import type { AcceptScheduleClientOperation } from "./types.ts"

const operation: AcceptScheduleClientOperation = {
  operationId: "production.accept-schedule.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    accept: {
      method: "POST",
      path: "/production/locations/:locationId/schedules/:scheduleRunId/accept",
    },
  },
}

const result: AcceptScheduleResult = {
  scheduleRunId: "38000000-0000-4000-8000-000000000001",
  productionShiftId: "38000000-0000-4000-8000-000000000002",
  acceptedAt: "2026-08-22T16:00:00.000Z",
  replayed: false,
}

describe("Processor accept-schedule experience", () => {
  it("preserves the canonical request and result contracts through generated metadata", async () => {
    const request = vi
      .fn<AcceptScheduleRequestTransport>()
      .mockResolvedValue(result)
    const accept = makeAcceptScheduleClient({ operation, request })
    const body = acceptScheduleRequestSchema.parse({
      expectedOutputPlanHash: "a".repeat(64),
      acknowledgedWarningCodes: ["SHIFT_OVERFLOW", "OVERSIZED_ORDER"],
      idempotencyKey: "accept-schedule-command-1",
    })

    await expect(
      accept({
        locationId: "pressly one/north",
        scheduleRunId: result.scheduleRunId,
        ...body,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: operation.http.accept.method,
        path: `/production/locations/pressly%20one%2Fnorth/schedules/${result.scheduleRunId}/accept`,
        body,
      },
      acceptScheduleResultSchema
    )
  })
})

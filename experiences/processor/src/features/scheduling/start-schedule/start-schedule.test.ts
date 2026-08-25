import {
  startScheduleRequestSchema,
  startScheduleResultSchema,
  type StartScheduleResult,
} from "@pressly/production-system/contracts/scheduling/start-schedule"
import { describe, expect, it, vi } from "vitest"
import {
  makeStartScheduleClient,
  type StartScheduleRequestTransport,
} from "./client.ts"
import type { StartScheduleClientOperation } from "./types.ts"

const operation: StartScheduleClientOperation = {
  operationId: "production.start-schedule.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    start: {
      method: "POST",
      path: "/production/locations/:locationId/schedules/:scheduleRunId/start",
    },
  },
}

const result: StartScheduleResult = {
  scheduleRunId: "88000000-0000-4000-8000-000000000001",
  productionRunId: "88000000-0000-4000-8000-000000000002",
  productionBatchIds: ["88000000-0000-4000-8000-000000000003"],
  queueVersion: 1,
  startedAt: "2026-08-22T16:00:00.000Z",
  replayed: false,
}

describe("Processor start-schedule experience", () => {
  it("preserves the canonical request and result contracts through generated metadata", async () => {
    const request = vi
      .fn<StartScheduleRequestTransport>()
      .mockResolvedValue(result)
    const start = makeStartScheduleClient({ operation, request })
    const body = startScheduleRequestSchema.parse({
      expectedOutputPlanHash: "a".repeat(64),
      idempotencyKey: "start-schedule-command-1",
    })

    await expect(
      start({
        locationId: "pressly one/north",
        scheduleRunId: result.scheduleRunId,
        ...body,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: operation.http.start.method,
        path: `/production/locations/pressly%20one%2Fnorth/schedules/${result.scheduleRunId}/start`,
        body,
      },
      startScheduleResultSchema
    )
  })
})

import {
  scheduleProposalSchema,
  type ScheduleProposal,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import { describe, expect, it, vi } from "vitest"
import {
  makeLoadScheduleClient,
  type LoadScheduleRequestTransport,
} from "./client.ts"
import type { LoadScheduleClientOperation } from "./types.ts"

const operation: LoadScheduleClientOperation = {
  operationId: "production.load-schedule.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    request: {
      method: "GET",
      path: "/production/locations/:locationId/schedules/:scheduleRunId",
    },
  },
}

const result = {
  scheduleRunId: "10000000-0000-4000-8000-000000000001",
  productionShiftId: "10000000-0000-4000-8000-000000000002",
  schedulerConfigId: "10000000-0000-4000-8000-000000000003",
  status: "draft",
  inputSnapshotHash: "a".repeat(64),
  outputPlanHash: "b".repeat(64),
  algorithmVersion: "fixed-pulse-ffd-v2",
  pulseMinutes: 56,
  pulseCapacityLbs: 80,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: "2026-08-22T20:00:00.000Z",
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: "2026-08-22T15:00:00.000Z",
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
} satisfies ScheduleProposal

describe("Processor load-schedule experience", () => {
  it("renders both generated path parameters and retains the canonical decoder", async () => {
    const request = vi
      .fn<LoadScheduleRequestTransport>()
      .mockResolvedValue(result)
    const loadSchedule = makeLoadScheduleClient({ operation, request })

    await expect(
      loadSchedule("pressly one/north", "schedule/id with space")
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/production/locations/pressly%20one%2Fnorth/schedules/schedule%2Fid%20with%20space",
      },
      scheduleProposalSchema
    )
  })
})

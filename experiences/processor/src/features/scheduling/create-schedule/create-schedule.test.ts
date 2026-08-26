import { createScheduleRequestSchema } from "@pressly/production-system/contracts/scheduling/create-schedule"
import {
  scheduleProposalSchema,
  type ScheduleProposal,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import { describe, expect, it, vi } from "vitest"
import {
  makeCreateScheduleClient,
  type CreateScheduleRequestTransport,
} from "./client.ts"
import type { CreateScheduleClientOperation } from "./types.ts"

const operation: CreateScheduleClientOperation = {
  operationId: "production.create-schedule.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    schedules: {
      method: "POST",
      path: "/production/locations/:locationId/schedules",
    },
  },
}

const proposal: ScheduleProposal = {
  scheduleRunId: "82000000-0000-4000-8000-000000000001",
  productionShiftId: "82000000-0000-4000-8000-000000000002",
  schedulerConfigId: "82000000-0000-4000-8000-000000000003",
  status: "draft",
  inputSnapshotHash: "a".repeat(64),
  outputPlanHash: "b".repeat(64),
  algorithmVersion: "fixed-pulse-ffd-v2",
  pulseMinutes: 30,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: "2026-08-22T13:00:00.000Z",
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: "2026-08-22T12:00:00.000Z",
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
}

describe("Processor create-schedule experience", () => {
  it("preserves canonical request and proposal contracts through declared metadata", async () => {
    const request = vi
      .fn<CreateScheduleRequestTransport>()
      .mockResolvedValue(proposal)
    const createSchedule = makeCreateScheduleClient({ operation, request })
    const body = createScheduleRequestSchema.parse({
      productionShiftId: proposal.productionShiftId,
      schedulerConfigId: proposal.schedulerConfigId,
      idempotencyKey: "create-schedule-command-1",
    })

    await expect(
      createSchedule({ locationId: "pressly one/north", ...body })
    ).resolves.toEqual(proposal)
    expect(request).toHaveBeenCalledWith(
      {
        method: operation.http.schedules.method,
        path: "/production/locations/pressly%20one%2Fnorth/schedules",
        body,
      },
      scheduleProposalSchema
    )
  })
})

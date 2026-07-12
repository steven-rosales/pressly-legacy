import { describe, expect, it, vi } from "vitest"
import { makeApiProductionAdapter } from "@/adapters/production/api-production.adapter"
import {
  testBoard,
  testSchedule,
  testWorkspace,
} from "../../fixtures/production.fixture"

describe("production API gateway", () => {
  it("maps discovery, workspace, order, schedule, and board reads to owning routes", async () => {
    const request = vi.fn().mockImplementation(({ path }: { path: string }) => {
      if (path === "/production/locations")
        return Promise.resolve({
          items: [testWorkspace.location],
          asOf: testWorkspace.asOf,
        })
      if (path.endsWith("/workspace")) return Promise.resolve(testWorkspace)
      if (path.includes("/orders?"))
        return Promise.resolve({
          items: [],
          nextCursor: null,
          asOf: testWorkspace.asOf,
        })
      if (path.endsWith("/board")) return Promise.resolve(testBoard)
      return Promise.resolve(testSchedule)
    })
    const gateway = makeApiProductionAdapter(request)

    await gateway.listLocations()
    await gateway.loadWorkspace(testWorkspace.location.id)
    await gateway.listOrders({ locationId: testWorkspace.location.id })
    await gateway.loadSchedule(
      testWorkspace.location.id,
      testSchedule.scheduleRunId
    )
    await gateway.loadBoard(
      testWorkspace.location.id,
      testSchedule.productionShiftId
    )

    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      "/production/locations",
      `/production/locations/${testWorkspace.location.id}/workspace`,
      `/production/locations/${testWorkspace.location.id}/orders?limit=100`,
      `/production/locations/${testWorkspace.location.id}/schedules/${testSchedule.scheduleRunId}`,
      `/production/locations/${testWorkspace.location.id}/shifts/${testSchedule.productionShiftId}/board`,
    ])
  })

  it("sends versions and idempotency keys on intake and machine assignment", async () => {
    const request = vi.fn().mockResolvedValue({
      entityId: testBoard.batches[0]!.stages[1]!.id,
      version: 2,
      replayed: false,
    })
    const gateway = makeApiProductionAdapter(request)

    await gateway.recordIntake({
      locationId: testWorkspace.location.id,
      productionOrderId: testBoard.batches[0]!.orders[0]!.id,
      bagCount: 3,
      expectedVersion: 1,
      idempotencyKey: "intake-command-1",
    })
    await gateway.assignStageMachines({
      locationId: testWorkspace.location.id,
      stageRunId: testBoard.batches[0]!.stages[1]!.id,
      machineIds: [testWorkspace.machines[0]!.id],
      expectedVersion: 1,
      idempotencyKey: "machine-command-1",
    })

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          expectedVersion: 1,
          idempotencyKey: "intake-command-1",
        }),
      }),
      expect.anything()
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          machineIds: [testWorkspace.machines[0]!.id],
          idempotencyKey: "machine-command-1",
        }),
      }),
      expect.anything()
    )
  })

  it("forwards the operator-confirmed stage-fit assertion without inventing it", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(testWorkspace.currentSchedulerConfig)
    const gateway = makeApiProductionAdapter(request)

    await gateway.publishConfig({
      locationId: testWorkspace.location.id,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      idempotencyKey: "publish-config-command-1",
    })

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        body: {
          pulseMinutes: 56,
          foldLbsPerFolderMinute: 2,
          stageFitAssertion: {
            sortingFits: true,
            washingFits: true,
            dryingFits: true,
          },
          idempotencyKey: "publish-config-command-1",
        },
      }),
      expect.anything()
    )
  })
})

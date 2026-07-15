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
      testBoard.productionRun.id
    )

    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      "/production/locations",
      `/production/locations/${testWorkspace.location.id}/workspace`,
      `/production/locations/${testWorkspace.location.id}/orders?limit=100`,
      `/production/locations/${testWorkspace.location.id}/schedules/${testSchedule.scheduleRunId}`,
      `/production/locations/${testWorkspace.location.id}/runs/${testBoard.productionRun.id}/board`,
    ])
  })

  it("uses explicit shift and run identities for resumable reads", async () => {
    const request = vi
      .fn()
      .mockImplementation(({ path }: { path: string }) =>
        path.endsWith("/board")
          ? Promise.resolve(testBoard)
          : Promise.resolve(testWorkspace)
      )
    const gateway = makeApiProductionAdapter(request)

    await gateway.loadWorkspace(
      testWorkspace.location.id,
      testSchedule.productionShiftId
    )
    await gateway.loadBoard(
      testWorkspace.location.id,
      testBoard.productionRun.id
    )

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: `/production/locations/${testWorkspace.location.id}/workspace?shiftId=${testSchedule.productionShiftId}`,
      }),
      expect.anything()
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: `/production/locations/${testWorkspace.location.id}/runs/${testBoard.productionRun.id}/board`,
      }),
      expect.anything()
    )
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

  it("sends queue versions on freeze, automatic, exact, and overtime commands", async () => {
    const request = vi.fn().mockResolvedValue({})
    const gateway = makeApiProductionAdapter(request)
    const batch = testBoard.batches[0]!
    const order = batch.orders[0]!
    const common = {
      locationId: testWorkspace.location.id,
      productionRunId: testBoard.productionRun.id,
      expectedQueueVersion: testBoard.productionRun.queueVersion,
      idempotencyKey: "queue-command-1",
    }

    await gateway.freezeBatch({
      ...common,
      productionBatchId: batch.id,
      expectedBatchVersion: batch.version,
    })
    await gateway.retryAutomaticPlacement({
      ...common,
      productionOrderId: order.id,
    })
    await gateway.placeOrderExactly({
      ...common,
      productionOrderId: order.id,
      productionBatchId: batch.id,
      expectedBatchVersion: batch.version,
    })
    await gateway.confirmPlacementOvertime({
      ...common,
      productionOrderId: order.id,
      proposalHash: "f".repeat(64),
    })

    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/batches/${batch.id}/freeze`,
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/orders/${order.id}/place`,
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/batches/${batch.id}/orders/${order.id}/place`,
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/orders/${order.id}/confirm-overtime`,
    ])
    for (const [input] of request.mock.calls)
      expect(input.body).toEqual(
        expect.objectContaining({
          expectedQueueVersion: common.expectedQueueVersion,
          idempotencyKey: common.idempotencyKey,
        })
      )
  })

  it("updates a shift in place and echoes a version-bound early-completion confirmation", async () => {
    const request = vi.fn().mockResolvedValue({})
    const gateway = makeApiProductionAdapter(request)
    const stage = testBoard.batches[0]!.stages[0]!
    const confirmation = {
      observedAt: "2026-08-01T14:10:00.000Z",
      confirmationHash: "c".repeat(64),
    }

    await gateway.updateShift({
      locationId: testWorkspace.location.id,
      productionShiftId: testWorkspace.currentShift!.id,
      startsAt: testWorkspace.currentShift!.startsAt,
      endsAt: testWorkspace.currentShift!.endsAt,
      effectiveFolderCount: 3,
      expectedVersion: testWorkspace.currentShift!.version,
      idempotencyKey: "update-shift-command-1",
    })
    await gateway.advanceStage({
      locationId: testWorkspace.location.id,
      stageRunId: stage.id,
      transition: "complete",
      expectedVersion: stage.version,
      confirmation,
      idempotencyKey: "complete-stage-command-1",
    })

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "PATCH",
        path: `/production/locations/${testWorkspace.location.id}/shifts/${testWorkspace.currentShift!.id}`,
        body: expect.objectContaining({
          effectiveFolderCount: 3,
          expectedVersion: testWorkspace.currentShift!.version,
        }),
      }),
      expect.anything()
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        path: `/production/locations/${testWorkspace.location.id}/stages/${stage.id}/complete`,
        body: expect.objectContaining({ confirmation }),
      }),
      expect.anything()
    )
  })
})

import { describe, expect, it, vi } from "vitest"
import { makeApiProductionAdapter } from "@/adapters/production/api-production.adapter"
import {
  testBoard,
  testRemainingDayForecast,
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

  it("loads the remaining-day forecast with an encoded service day and forwards cancellation", async () => {
    const request = vi.fn().mockResolvedValue(testRemainingDayForecast)
    const gateway = makeApiProductionAdapter(request)
    const controller = new AbortController()

    await gateway.loadRemainingDayForecast({
      locationId: testWorkspace.location.id,
      serviceDay: testRemainingDayForecast.serviceDay,
      signal: controller.signal,
    })

    expect(request).toHaveBeenCalledWith(
      {
        path: `/production/locations/${testWorkspace.location.id}/forecast?serviceDay=2026-08-01`,
        signal: controller.signal,
      },
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

  it("uses the dedicated Pressly admission resource without sending Cents state", async () => {
    const orderId = testBoard.batches[0]!.orders[0]!.id
    const request = vi.fn().mockResolvedValue({
      locationId: testWorkspace.location.id,
      orderId,
      admissionOverride: "released",
      status: "eligible",
      version: 3,
      replayed: false,
    })
    const gateway = makeApiProductionAdapter(request)

    await gateway.changeAdmission({
      locationId: testWorkspace.location.id,
      productionOrderId: orderId,
      target: "released",
      expectedVersion: 2,
      idempotencyKey: "admission-command-1",
    })

    expect(request).toHaveBeenCalledWith(
      {
        method: "PUT",
        path: `/production/locations/${testWorkspace.location.id}/orders/${orderId}/admission`,
        body: {
          target: "released",
          expectedVersion: 2,
          idempotencyKey: "admission-command-1",
        },
      },
      expect.anything()
    )
  })

  it("uses versioned manager resources for backlog review, commit, and restore", async () => {
    const orderId = testBoard.batches[0]!.orders[0]!.id
    const request = vi.fn().mockResolvedValue({})
    const gateway = makeApiProductionAdapter(request)
    const scope = {
      filter: "all_due_before_cutoff" as const,
      cutoff: "2026-06-30T03:59:59.999Z",
      reason: "processor_not_in_use" as const,
      cursor: null,
      maxOrders: 250,
    }

    await gateway.previewOrderBacklog({
      locationId: testWorkspace.location.id,
      request: scope,
    })
    await gateway.commitOrderBacklog({
      locationId: testWorkspace.location.id,
      request: {
        ...scope,
        note: null,
        previewHash: "a".repeat(64),
        idempotencyKey: "archive-old-orders-1",
      },
    })
    await gateway.changeOrderResolution({
      locationId: testWorkspace.location.id,
      productionOrderId: orderId,
      request: {
        action: "restore",
        reason: "manager_correction",
        note: null,
        expectedVersion: 7,
        idempotencyKey: "restore-order-1",
      },
    })

    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      `/production/locations/${testWorkspace.location.id}/order-backlog/preview`,
      `/production/locations/${testWorkspace.location.id}/order-backlog`,
      `/production/locations/${testWorkspace.location.id}/orders/${orderId}/resolution`,
    ])
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          previewHash: "a".repeat(64),
          idempotencyKey: "archive-old-orders-1",
        }),
      }),
      expect.anything()
    )
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          action: "restore",
          expectedVersion: 7,
          idempotencyKey: "restore-order-1",
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

  it("sends queue versions on freeze, placement, overtime, and floor reconciliation commands", async () => {
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
    await gateway.reconcileBatchProgress({
      ...common,
      productionBatchId: batch.id,
      expectedBatchVersion: batch.version,
      expectedStageVersions: batch.stages.map((stage) => ({
        stageRunId: stage.id,
        version: stage.version,
      })),
      target: "folding_packaging_started",
      reason: "updates_missed",
      machineIds: [],
    })

    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/batches/${batch.id}/freeze`,
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/orders/${order.id}/place`,
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/batches/${batch.id}/orders/${order.id}/place`,
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/orders/${order.id}/confirm-overtime`,
      `/production/locations/${common.locationId}/runs/${common.productionRunId}/batches/${batch.id}/progress-reconciliation`,
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

  it("uses explicit order-route and production-history resources", async () => {
    const request = vi.fn().mockResolvedValue({})
    const gateway = makeApiProductionAdapter(request)
    const batch = testBoard.batches[0]!
    const order = batch.orders[0]!
    const routeRequest = {
      kind: "queued_move" as const,
      reason: "manual_rebatch" as const,
      targetProductionBatchId: batch.id,
      restartStage: "sorting" as const,
      expectedQueueVersion: testBoard.productionRun.queueVersion,
      expectedOrderVersion: order.version,
      expectedSourceBatchVersion: batch.version,
    }

    await gateway.listOrderControl({
      locationId: testWorkspace.location.id,
      query: { view: "active", limit: 25, priority: true },
    })
    await gateway.previewOrderRoute({
      locationId: testWorkspace.location.id,
      productionRunId: testBoard.productionRun.id,
      productionOrderId: order.id,
      request: routeRequest,
    })
    await gateway.commitOrderRoute({
      locationId: testWorkspace.location.id,
      productionRunId: testBoard.productionRun.id,
      productionOrderId: order.id,
      request: {
        ...routeRequest,
        proposalHash: "a".repeat(64),
        idempotencyKey: "manual-order-route-1",
      },
    })
    await gateway.listHistoryRuns({
      locationId: testWorkspace.location.id,
      query: { limit: 50 },
    })
    await gateway.listHistoryActivity({
      locationId: testWorkspace.location.id,
      query: { limit: 50, runId: testBoard.productionRun.id },
    })
    await gateway.listHistoryPlans({
      locationId: testWorkspace.location.id,
      query: { limit: 50, runId: testBoard.productionRun.id },
    })
    await gateway.loadHistoryRun(
      testWorkspace.location.id,
      testBoard.productionRun.id
    )

    expect(request.mock.calls.map(([input]) => input.path)).toEqual([
      `/production/locations/${testWorkspace.location.id}/order-control?view=active&limit=25&priority=true`,
      `/production/locations/${testWorkspace.location.id}/runs/${testBoard.productionRun.id}/orders/${order.id}/route/preview`,
      `/production/locations/${testWorkspace.location.id}/runs/${testBoard.productionRun.id}/orders/${order.id}/route`,
      `/production/locations/${testWorkspace.location.id}/history/runs?limit=50`,
      `/production/locations/${testWorkspace.location.id}/history/activity?limit=50&runId=${testBoard.productionRun.id}`,
      `/production/locations/${testWorkspace.location.id}/history/plans?limit=50&runId=${testBoard.productionRun.id}`,
      `/production/locations/${testWorkspace.location.id}/history/runs/${testBoard.productionRun.id}`,
    ])
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          proposalHash: "a".repeat(64),
          idempotencyKey: "manual-order-route-1",
        }),
      }),
      expect.anything()
    )
  })
})

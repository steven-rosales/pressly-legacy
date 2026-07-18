import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProductionBoardWorkspace } from "@/features/production-board/production-board.view"
import { RequestFailure } from "@/ports/request.error"
import {
  makeTestProductionPort,
  testBoard,
  testIdempotency,
  testWorkspace,
} from "../../fixtures/production.fixture"

const boardProps = {
  idempotency: testIdempotency,
  locationId: testWorkspace.location.id,
  productionRunId: testBoard.productionRun.id,
  timezone: testWorkspace.location.timezone,
  machines: testWorkspace.machines,
  initialBoard: testBoard,
} as const

afterEach(() => vi.unstubAllGlobals())

describe("production floor board", () => {
  it("renders blocked stage meaning correctly in Spanish", async () => {
    await i18next.changeLanguage("es")
    const board = structuredClone(testBoard)
    board.batches[0]!.stages[0]!.allowedActions = []
    board.batches[0]!.stages[0]!.nextAction = {
      state: "blocked",
      action: "start",
      code: "PREVIOUS_STAGE_INCOMPLETE",
      message: "The previous stage is still running.",
      availableAt: null,
    }

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={board}
        production={makeTestProductionPort()}
      />
    )

    expect(
      screen.getAllByText("Esperando la etapa anterior").length
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        "Completa la etapa anterior de este lote antes de iniciar esta."
      ).length
    ).toBeGreaterThan(0)
  })

  it("renders the resume snapshot and refreshes authoritative actions", async () => {
    const user = userEvent.setup()
    const resumed = structuredClone(testBoard)
    resumed.batches[0]!.stages[0]!.allowedActions = []
    resumed.batches[0]!.stages[0]!.nextAction = {
      state: "blocked",
      action: "start",
      code: "PREVIOUS_STAGE_INCOMPLETE",
      message: "The previous stage is still running.",
      availableAt: null,
    }
    const refreshed = structuredClone(testBoard)
    refreshed.batches[0]!.stages[0]!.allowedActions = ["start"]
    refreshed.batches[0]!.stages[0]!.nextAction = {
      state: "available",
      action: "start",
    }
    const loadBoard = vi.fn(async () => refreshed)

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={resumed}
        refreshBoard={loadBoard}
        production={makeTestProductionPort({ loadBoard })}
      />
    )

    expect(
      screen.getByLabelText("Batch 1, Sorting, planned")
    ).toBeInTheDocument()
    const summary = screen.getByRole("region", {
      name: "Production summary",
    })
    expect(within(summary).getByText("Started")).toBeInTheDocument()
    expect(within(summary).getByText(/Queue v1/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() => expect(loadBoard).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByRole("button", { name: "Start Sorting" })
    ).toBeInTheDocument()
  })

  it("keeps an early start actionable and refreshes once at its planned boundary", async () => {
    const boundaryBoard = structuredClone(testBoard)
    boundaryBoard.batches[0]!.stages[0]!.allowedActions = ["start"]
    boundaryBoard.batches[0]!.stages[0]!.nextAction = {
      state: "confirmation_required",
      action: "start",
      code: "PLANNED_START_NOT_REACHED",
      message: "The planned start is still ahead.",
      availableAt: boundaryBoard.asOf,
      timing: {
        plannedStartAt: boundaryBoard.asOf,
        plannedEndAt: "2026-08-01T14:50:00.000Z",
        observedAt: "2026-08-01T13:59:59.999Z",
        remainingMilliseconds: 1,
      },
    }
    const refreshBoard = vi.fn(async () => boundaryBoard)

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={boundaryBoard}
        refreshBoard={refreshBoard}
        production={makeTestProductionPort()}
      />
    )

    await waitFor(() => expect(refreshBoard).toHaveBeenCalledTimes(1))
    expect(
      screen.getByRole("button", { name: "Start Sorting now" })
    ).toBeInTheDocument()
  })

  it("applies an authoritative board refresh supplied by the workspace", async () => {
    const refreshed = structuredClone(testBoard)
    refreshed.productionRun.queueVersion = 2
    refreshed.eligibleOrders = [
      {
        id: "00000000-0000-4000-8000-000000000012",
        externalOrderId: "C-1003",
        dueAt: "2026-08-01T23:00:00.000Z",
        dueBucket: "today",
        priority: false,
        derivedWeightLbs: 60,
        bagCount: 2,
        version: 3,
        placement: {
          status: "awaiting_run",
          reason: "automatic_placement_not_attempted",
          message: "Automatic placement has not completed; it can be retried.",
        },
      },
    ]
    const production = makeTestProductionPort({
      loadBoard: vi.fn(async () => testBoard),
    })
    const { rerender } = render(
      <ProductionBoardWorkspace {...boardProps} production={production} />
    )

    rerender(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={refreshed}
        production={production}
      />
    )

    expect(await screen.findByText("Order C-1003")).toBeInTheDocument()
    expect(screen.getByText(/Queue v2/)).toBeInTheDocument()
  })

  it("freezes mutable membership with queue and batch versions", async () => {
    const user = userEvent.setup()
    const freezeBatch = vi.fn(async () => ({
      productionRunId: testBoard.productionRun.id,
      productionBatchId: testBoard.batches[0]!.id,
      queueVersion: 2,
      batchVersion: 2,
      membership: {
        state: "frozen" as const,
        frozenAt: "2026-08-01T14:05:00.000Z",
        frozenBy: "00000000-0000-4000-8000-000000000090",
      },
      replayed: false,
    }))
    const loadBoard = vi.fn(async () => testBoard)
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        production={makeTestProductionPort({ freezeBatch, loadBoard })}
      />
    )

    await user.click(screen.getByRole("button", { name: "Freeze" }))
    expect(freezeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        productionRunId: testBoard.productionRun.id,
        productionBatchId: testBoard.batches[0]!.id,
        expectedQueueVersion: testBoard.productionRun.queueVersion,
        expectedBatchVersion: testBoard.batches[0]!.version,
      })
    )
    expect(loadBoard).toHaveBeenCalled()
  })

  it("assigns active machines with the stage version and then refreshes", async () => {
    const user = userEvent.setup()
    const assignStageMachines = vi.fn(async () => ({
      entityId: testBoard.batches[0]!.stages[1]!.id,
      version: 2,
      replayed: false,
    }))
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        production={makeTestProductionPort({ assignStageMachines })}
      />
    )

    const washingCard = screen.getByLabelText("Batch 1, Washing, planned")
    expect(washingCard).toHaveTextContent("Washer 1")
    expect(within(washingCard).queryByRole("checkbox")).not.toBeInTheDocument()
    await user.click(
      within(washingCard).getByRole("button", { name: "Edit machines" })
    )
    expect(
      screen.getByRole("heading", { name: "Assign washing machines" })
    ).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /Washer 1/ })).toBeChecked()
    expect(screen.getByText("100 / 200 lb")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save machines" }))
    await waitFor(() =>
      expect(assignStageMachines).toHaveBeenCalledWith(
        expect.objectContaining({
          stageRunId: testBoard.batches[0]!.stages[1]!.id,
          machineIds: [testWorkspace.machines[0]!.id],
          expectedVersion: 1,
        })
      )
    )
    expect(
      screen.queryByRole("heading", { name: "Assign washing machines" })
    ).not.toBeInTheDocument()
  })

  it("keeps the machine sheet open when the server rejects a stale assignment", async () => {
    const user = userEvent.setup()
    const assignStageMachines = vi.fn().mockRejectedValue(
      new RequestFailure({
        kind: "conflict",
        code: "PRODUCTION_VERSION_CONFLICT",
        message: "stale",
        status: 409,
      })
    )
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        production={makeTestProductionPort({ assignStageMachines })}
      />
    )

    await user.click(
      within(screen.getByLabelText("Batch 1, Washing, planned")).getByRole(
        "button",
        { name: "Edit machines" }
      )
    )
    await user.click(screen.getByRole("button", { name: "Save machines" }))

    expect(
      await screen.findByRole("heading", {
        name: "Assign washing machines",
      })
    ).toBeInTheDocument()
    expect(screen.getByText("Machine assignment not saved")).toBeInTheDocument()
    expect(screen.getAllByText(/has been refreshed/).length).toBeGreaterThan(0)
  })

  it("uses accessible stage tabs below the desktop breakpoint", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        production={makeTestProductionPort()}
      />
    )

    expect(
      screen.getByRole("tablist", { name: "Production stages" })
    ).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Washing" })).toHaveClass(
      "min-w-0",
      "text-xs"
    )
    await user.click(screen.getByRole("tab", { name: "Fold" }))
    expect(
      screen.getByLabelText("Batch 1, Folding & packaging, planned")
    ).toBeInTheDocument()
  })

  it("disables commands when the authoritative snapshot is offline", () => {
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        online={false}
        production={makeTestProductionPort()}
      />
    )

    expect(screen.getByText("Board is offline")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start Sorting" })).toBeDisabled()
  })

  it("asks for explicit confirmation before starting a stage ahead of plan", async () => {
    const user = userEvent.setup()
    const earlyBoard = structuredClone(testBoard)
    const stage = earlyBoard.batches[0]!.stages[0]!
    stage.plannedStartAt = "2026-08-01T14:19:00.000Z"
    stage.plannedEndAt = "2026-08-01T15:09:00.000Z"
    stage.allowedActions = ["start"]
    const timing = {
      plannedStartAt: stage.plannedStartAt,
      plannedEndAt: stage.plannedEndAt,
      observedAt: earlyBoard.asOf,
      remainingMilliseconds: 19 * 60_000,
    }
    stage.nextAction = {
      state: "confirmation_required",
      action: "start",
      code: "PLANNED_START_NOT_REACHED",
      message: "The planned start is still ahead.",
      availableAt: stage.plannedStartAt,
      timing,
    }
    const confirmation = {
      observedAt: timing.observedAt,
      confirmationHash: "s".repeat(64),
    }
    const advanceStage = vi.fn(async (command) =>
      command.confirmation === undefined
        ? {
            status: "confirmation_required" as const,
            stageRunId: stage.id,
            stageVersion: stage.version,
            code: "PLANNED_START_NOT_REACHED" as const,
            message: "The planned start is still ahead.",
            confirmation,
            timing,
            replayed: false as const,
          }
        : {
            entityId: stage.id,
            version: stage.version + 1,
            replayed: false,
          }
    )
    const refreshBoard = vi.fn(async () => earlyBoard)

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={earlyBoard}
        refreshBoard={refreshBoard}
        production={makeTestProductionPort({ advanceStage })}
      />
    )

    await user.click(screen.getByRole("button", { name: "Start Sorting now" }))
    expect(
      screen.getByRole("alertdialog", { name: "Start Sorting now?" })
    ).toHaveTextContent("19 min from now")
    await user.click(screen.getByRole("button", { name: "Start now" }))

    await waitFor(() => expect(advanceStage).toHaveBeenCalledTimes(2))
    expect(advanceStage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transition: "start",
        expectedVersion: stage.version,
        confirmation,
      })
    )
    expect(refreshBoard).toHaveBeenCalledOnce()
  })

  it("asks for explicit confirmation before completing a stage early", async () => {
    const user = userEvent.setup()
    const earlyBoard = structuredClone(testBoard)
    const stage = earlyBoard.batches[0]!.stages[0]!
    stage.status = "started"
    stage.actualStartAt = earlyBoard.asOf
    stage.allowedActions = ["complete"]
    const timing = {
      actualStartAt: earlyBoard.asOf,
      plannedEndAt: stage.plannedEndAt,
      completionBoundaryAt: stage.plannedEndAt,
      observedAt: "2026-08-01T14:10:00.000Z",
      plannedDurationMilliseconds: 3_000_000,
      elapsedMilliseconds: 600_000,
      remainingMilliseconds: 2_400_000,
    }
    stage.nextAction = {
      state: "confirmation_required",
      action: "complete",
      code: "PULSE_BOUNDARY_NOT_REACHED",
      message: "The planned pulse is still running.",
      availableAt: stage.plannedEndAt,
      timing,
    }
    const confirmation = {
      observedAt: timing.observedAt,
      confirmationHash: "c".repeat(64),
    }
    const advanceStage = vi.fn(async (command) =>
      command.confirmation === undefined
        ? {
            status: "confirmation_required" as const,
            stageRunId: stage.id,
            stageVersion: stage.version,
            code: "PULSE_BOUNDARY_NOT_REACHED" as const,
            message: "The planned pulse is still running.",
            confirmation,
            timing,
            replayed: false as const,
          }
        : {
            entityId: stage.id,
            version: stage.version + 1,
            replayed: false,
          }
    )
    const refreshBoard = vi.fn(async () => earlyBoard)

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={earlyBoard}
        refreshBoard={refreshBoard}
        production={makeTestProductionPort({ advanceStage })}
      />
    )

    await user.click(screen.getByRole("button", { name: "Complete Sorting" }))
    expect(
      screen.getByRole("alertdialog", { name: "Complete this stage early?" })
    ).toHaveTextContent("10 min of its 50 min planned pulse")
    expect(refreshBoard).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Complete early" }))
    await waitFor(() => expect(advanceStage).toHaveBeenCalledTimes(2))
    expect(advanceStage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transition: "complete",
        expectedVersion: stage.version,
        confirmation,
      })
    )
    expect(refreshBoard).toHaveBeenCalledOnce()
  })

  it("refreshes operational truth after a stale-version conflict", async () => {
    const user = userEvent.setup()
    const conflicting = makeTestProductionPort({
      advanceStage: vi.fn().mockRejectedValue(
        new RequestFailure({
          kind: "conflict",
          code: "PRODUCTION_VERSION_CONFLICT",
          message: "stale",
          status: 409,
        })
      ),
      loadBoard: vi.fn(async () => testBoard),
    })
    render(
      <ProductionBoardWorkspace {...boardProps} production={conflicting} />
    )
    await user.click(screen.getByRole("button", { name: "Start Sorting" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "has been refreshed"
    )
  })

  it("announces every rendered batch, stage, and status", () => {
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        production={makeTestProductionPort()}
      />
    )
    expect(
      screen.getByLabelText("Batch 1, Sorting, planned")
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("Batch 1, Folding & packaging, planned")
    ).toBeInTheDocument()
  })

  it("renders pending arrivals and confirms the exact version-bound overtime proposal", async () => {
    const user = userEvent.setup()
    const pendingBoard = structuredClone(testBoard)
    pendingBoard.eligibleOrders = [
      {
        id: "00000000-0000-4000-8000-000000000012",
        externalOrderId: "C-1003",
        dueAt: "2026-08-01T23:00:00.000Z",
        dueBucket: "today",
        priority: true,
        derivedWeightLbs: 60,
        bagCount: 2,
        version: 3,
        placement: {
          status: "awaiting_run",
          reason: "automatic_placement_not_attempted",
          message: "Automatic placement has not completed; it can be retried.",
        },
      },
    ]
    const confirmation = {
      status: "confirmation_required" as const,
      mode: "automatic" as const,
      productionRunId: pendingBoard.productionRun.id,
      productionOrderId: pendingBoard.eligibleOrders[0]!.id,
      target: {
        kind: "new_batch" as const,
        sequence: 1,
      },
      affectedBatchIds: [],
      queueVersion: pendingBoard.productionRun.queueVersion,
      proposalHash: "d".repeat(64),
      projectedCompletionAt: "2026-08-01T20:30:00.000Z",
      overtimeMinutes: 30,
      replayed: false as const,
    }
    const confirmationBoard = structuredClone(pendingBoard)
    confirmationBoard.eligibleOrders[0]!.placement = {
      status: confirmation.status,
      mode: confirmation.mode,
      productionRunId: confirmation.productionRunId,
      target: confirmation.target,
      affectedBatchIds: confirmation.affectedBatchIds,
      queueVersion: confirmation.queueVersion,
      proposalHash: confirmation.proposalHash,
      projectedCompletionAt: confirmation.projectedCompletionAt,
      overtimeMinutes: confirmation.overtimeMinutes,
    }
    let attempted = false
    const retryAutomaticPlacement = vi.fn(async () => {
      attempted = true
      return confirmation
    })
    const confirmPlacementOvertime = vi.fn(async () => ({
      status: "placed" as const,
      mode: "automatic" as const,
      productionRunId: pendingBoard.productionRun.id,
      productionOrderId: pendingBoard.eligibleOrders[0]!.id,
      productionBatchId: "00000000-0000-4000-8000-000000000033",
      createdBatch: true,
      affectedBatchIds: ["00000000-0000-4000-8000-000000000033"],
      queueVersion: 2,
      proposalHash: confirmation.proposalHash,
      plannedCompletionAt: confirmation.projectedCompletionAt,
      overtimeMinutes: 30,
      replayed: false,
    }))
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        canManage
        initialBoard={pendingBoard}
        production={makeTestProductionPort({
          loadBoard: async () => (attempted ? confirmationBoard : pendingBoard),
          retryAutomaticPlacement,
          confirmPlacementOvertime,
        })}
      />
    )

    expect(screen.getByText("Order C-1003")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Retry automatic" }))
    expect(await screen.findByText(/adds 30 minutes/)).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Confirm overtime and place" })
    )
    expect(confirmPlacementOvertime).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedQueueVersion: confirmation.queueVersion,
        proposalHash: confirmation.proposalHash,
      })
    )
  })

  it("reviews and confirms one atomic floor-progress reconciliation", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const user = userEvent.setup()
    const batch = testBoard.batches[0]!
    const preview = {
      status: "confirmation_required" as const,
      productionRunId: testBoard.productionRun.id,
      productionBatchId: batch.id,
      currentMilestone: "waiting_to_sort" as const,
      targetMilestone: "finished" as const,
      queueVersion: testBoard.productionRun.queueVersion,
      batchVersion: batch.version,
      stageVersions: batch.stages.map((stage) => ({
        stageRunId: stage.id,
        version: stage.version,
      })),
      confirmation: { proposalHash: "r".repeat(64) },
      effects: {
        completedStages: [
          "sorting",
          "washing",
          "drying",
          "folding_packaging",
        ] as Array<"sorting" | "washing" | "drying" | "folding_packaging">,
        activeStage: null,
        finishesBatch: true,
        finishesRun: true,
        closesShift: true,
      },
      replayed: false as const,
    }
    const reconcileBatchProgress = vi.fn(async (command) =>
      command.confirmation === undefined
        ? preview
        : {
            status: "reconciled" as const,
            productionRunId: testBoard.productionRun.id,
            productionBatchId: batch.id,
            milestone: "finished" as const,
            queueVersion: 2,
            batchVersion: 2,
            stageVersions: batch.stages.map((stage) => ({
              stageRunId: stage.id,
              version: stage.version + 1,
            })),
            finishedOrderCount: batch.orders.length,
            finishedBagCount: batch.orders.reduce(
              (sum, order) => sum + order.bagCount,
              0
            ),
            runCompleted: true,
            shiftClosed: true,
            replayed: false,
          }
    )
    const refreshBoard = vi.fn(async () => testBoard)

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        refreshBoard={refreshBoard}
        production={makeTestProductionPort({ reconcileBatchProgress })}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Record floor progress" })
    )
    await user.click(screen.getByRole("radio", { name: "Finished" }))
    expect(screen.getByText(/finishes 2 orders and 5 bags/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Review progress" }))
    expect(await screen.findByText("Ready to record")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Confirm and record" }))

    await waitFor(() => expect(reconcileBatchProgress).toHaveBeenCalledTimes(2))
    expect(reconcileBatchProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedQueueVersion: preview.queueVersion,
        expectedBatchVersion: preview.batchVersion,
        expectedStageVersions: preview.stageVersions,
        target: "finished",
        confirmation: preview.confirmation,
      })
    )
    expect(refreshBoard).toHaveBeenCalledOnce()
  })
})

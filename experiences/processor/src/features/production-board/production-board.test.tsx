import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithProcessorBrowserCapabilities as render } from "../../../test/support/browser-capabilities.fixture.tsx"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { processorProductionBoardFeature } from "./feature"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { afterEach, describe, expect, it, vi } from "vitest"
import { invariantViolationError } from "@pressly/errors/factories"
import { ProductionBoardWorkspace } from "./production-board.view"
import { requestFailure } from "../../capabilities/request.error"
import {
  makeTestProductionPort,
  testBoard,
  testIdempotency,
  testWorkspace,
} from "../../../test/fixtures/production.fixture"

const boardProps = {
  idempotency: testIdempotency,
  locationId: testWorkspace.location.id,
  productionRunId: testBoard.productionRun.id,
  timezone: testWorkspace.location.timezone,
  machines: testWorkspace.machines,
  initialBoard: testBoard,
} as const

const stubViewport = ({
  mobile,
  wide,
}: Readonly<{ mobile: boolean; wide: boolean }>) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches:
        query === "(max-width: 767px)"
          ? mobile
          : query === "(min-width: 1280px)"
            ? wide
            : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

const makeTwoBatchBoard = () => {
  const board = structuredClone(testBoard)
  const firstBatch = board.batches[0]!
  const secondBatch = structuredClone(firstBatch)
  const secondBatchId = "00000000-0000-4000-8000-000000000031"

  firstBatch.orders = [firstBatch.orders[0]!]
  firstBatch.derivedWeightLbs = firstBatch.orders[0]!.derivedWeightLbs
  secondBatch.id = secondBatchId
  secondBatch.sequence = 1
  secondBatch.orders = [secondBatch.orders[1]!]
  secondBatch.derivedWeightLbs = secondBatch.orders[0]!.derivedWeightLbs
  secondBatch.stages = secondBatch.stages.map((stage, index) => ({
    ...stage,
    id: `00000000-0000-4000-8000-${(50 + index).toString().padStart(12, "0")}`,
    productionBatchId: secondBatchId,
  }))
  board.batches = [firstBatch, secondBatch]
  return board
}

afterEach(() => vi.unstubAllGlobals())

describe("production floor board", () => {
  proveExperienceFeature({
    featureId: "processor.production-board",
    feature: processorProductionBoardFeature,
    scenarios: [
      {
        name: "opens a non-draggable 90% desktop sheet with a semantic order table",
        proves: ["presentation-state", "component-interaction"],
        run: async () => {
          await i18next.changeLanguage("en")
          stubViewport({ mobile: false, wide: true })
          const user = userEvent.setup()

          render(
            <ProductionBoardWorkspace
              {...boardProps}
              production={makeTestProductionPort()}
            />
          )

          const trigger = screen.getByRole("button", {
            name: /View orders in Batch 1/,
          })
          await user.click(trigger)

          const heading = screen.getByRole("heading", {
            name: "Batch 1 orders",
          })
          const sheet = heading.closest('[data-slot="sheet-content"]')
          expect(sheet).toHaveAttribute("data-side", "bottom")
          expect(sheet).toHaveClass(
            "h-[90dvh]",
            "max-h-[90dvh]",
            "overflow-hidden",
            "data-[side=bottom]:h-[90dvh]",
            "data-[side=bottom]:max-h-[90dvh]"
          )
          expect(
            screen.queryByRole("heading", { name: "Orders in this batch" })
          ).not.toBeInTheDocument()
          expect(
            document.querySelector('[data-slot="drawer-content"]')
          ).not.toBeInTheDocument()

          const table = screen.getByRole("table", {
            name: "Orders in this batch",
          })
          for (const header of [
            "Order / customer",
            "Bags",
            "Weight",
            "Due",
            "Handling",
          ]) {
            expect(
              within(table).getByRole("columnheader", { name: header })
            ).toBeInTheDocument()
          }
          const firstOrder = within(table).getByRole("row", {
            name: /Order C-1001\s*Northwind Hotel/,
          })
          expect(firstOrder).toHaveTextContent("3")
          expect(firstOrder).toHaveTextContent("120 lb")
          expect(firstOrder).toHaveTextContent("Today")
          const secondOrder = within(table).getByRole("row", {
            name: /Order C-1002\s*Camila Reed/,
          })
          expect(secondOrder).toHaveTextContent("2")
          expect(secondOrder).toHaveTextContent("80 lb")
          expect(secondOrder).toHaveTextContent("Tomorrow")
          expect(screen.getByText("Start Sorting")).toBeInTheDocument()

          fireEvent.click(
            screen.getByRole("button", { name: "Close batch orders" })
          )
          await waitFor(() => expect(trigger).toHaveFocus())
        },
      },
    ],
  })

  it("keeps the draggable 90% mobile drawer and stacked order cards", async () => {
    await i18next.changeLanguage("en")
    stubViewport({ mobile: true, wide: false })
    const user = userEvent.setup()

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        production={makeTestProductionPort()}
      />
    )

    const trigger = screen.getByRole("button", {
      name: /View orders in Batch 1/,
    })
    await user.click(trigger)

    const drawer = screen
      .getByRole("heading", { name: "Batch 1 orders" })
      .closest('[data-slot="drawer-content"]')
    expect(drawer).toHaveClass(
      "h-[90dvh]",
      "max-h-[90dvh]",
      "data-[vaul-drawer-direction=bottom]:h-[90dvh]",
      "data-[vaul-drawer-direction=bottom]:max-h-[90dvh]"
    )
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    const list = screen.getByRole("list")
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    expect(within(list).getByText("Order C-1001")).toBeInTheDocument()
    expect(within(list).getByText("Northwind Hotel")).toBeInTheDocument()
    expect(within(list).getByText("Order C-1002")).toBeInTheDocument()
    expect(within(list).getByText("Camila Reed")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close batch orders" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("switches batches inside the desktop order inspector", async () => {
    await i18next.changeLanguage("en")
    stubViewport({ mobile: false, wide: true })
    const user = userEvent.setup()
    const board = makeTwoBatchBoard()

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={board}
        production={makeTestProductionPort()}
      />
    )

    await user.click(
      screen.getByRole("button", {
        name: /View orders in Batch 1/,
      })
    )
    expect(screen.getByText("Northwind Hotel")).toBeInTheDocument()
    const batchSelect = screen.getByRole("combobox", { name: "Choose batch" })
    batchSelect.focus()
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")

    expect(
      screen.getByRole("heading", { name: "Batch 2 orders" })
    ).toBeInTheDocument()
    expect(screen.getByText("Camila Reed")).toBeInTheDocument()
    expect(screen.queryByText("Northwind Hotel")).not.toBeInTheDocument()
  })

  it("exposes one manifest action per batch only from Batch membership", async () => {
    await i18next.changeLanguage("en")
    stubViewport({ mobile: false, wide: true })
    const board = makeTwoBatchBoard()

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={board}
        production={makeTestProductionPort()}
      />
    )

    const membershipCard = screen
      .getByText("Batch membership")
      .closest('[data-slot="card"]')
    if (!(membershipCard instanceof HTMLElement)) {
      throw invariantViolationError({
        code: "processor_test_batch_membership_missing",
        message: "Batch membership card was not rendered",
      })
    }
    expect(
      within(membershipCard).getAllByRole("button", {
        name: /View orders in Batch [12]/,
      })
    ).toHaveLength(2)
    expect(
      screen.getAllByRole("button", {
        name: /View orders in Batch [12]/,
      })
    ).toHaveLength(2)
    expect(
      within(membershipCard).getAllByRole("button", { name: "Freeze" })
    ).toHaveLength(2)

    for (const card of screen.getAllByLabelText(/^Batch [12],/)) {
      expect(
        within(card).queryByRole("button", { name: /View orders/ })
      ).not.toBeInTheDocument()
      expect(card).toHaveTextContent(
        card.getAttribute("aria-label")?.startsWith("Batch 1")
          ? "1 order · 3 bags"
          : "1 order · 2 bags"
      )
    }
  })

  it("renders blocked stage meaning correctly in Spanish", async () => {
    await i18next.changeLanguage("es")
    const board = structuredClone(testBoard)
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
    resumed.batches[0]!.stages[0]!.nextAction = {
      state: "blocked",
      action: "start",
      code: "PREVIOUS_STAGE_INCOMPLETE",
      message: "The previous stage is still running.",
      availableAt: null,
    }
    const refreshed = structuredClone(testBoard)
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
  }, 10_000)

  it("keeps an early start actionable and refreshes once at its planned boundary", async () => {
    const boundaryBoard = structuredClone(testBoard)
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

    expect(
      await screen.findByText("1 ready order needs placement review")
    ).toBeInTheDocument()
    expect(screen.queryByText("Order C-1003")).toBeNull()
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
      requestFailure({
        requestKind: "conflict",
        code: "PRODUCTION_VERSION_CONFLICT",
        message: "stale",
        responseStatus: 409,
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
        requestFailure({
          requestKind: "conflict",
          code: "PRODUCTION_VERSION_CONFLICT",
          message: "stale",
          responseStatus: 409,
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

  it("keeps live-run additions compact and hands the decision to Schedule", async () => {
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
    const onOpenSchedule = vi.fn()
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        canManage
        initialBoard={pendingBoard}
        production={makeTestProductionPort()}
        onOpenSchedule={onOpenSchedule}
      />
    )

    expect(
      screen.getByText("1 ready order needs placement review")
    ).toBeVisible()
    expect(
      screen.getByText(
        "Review additions in Schedule. Floor execution stays unchanged here."
      )
    ).toBeVisible()
    expect(screen.queryByText("Order C-1003")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Review in Schedule" }))
    expect(onOpenSchedule).toHaveBeenCalledWith(pendingBoard.productionShift.id)
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

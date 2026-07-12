import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
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
  productionShiftId: testBoard.productionShift.id,
  timezone: testWorkspace.location.timezone,
  machines: testWorkspace.machines,
  initialBoard: testBoard,
} as const

describe("production floor board", () => {
  it("renders the resume snapshot and refreshes authoritative actions", async () => {
    const resumed = structuredClone(testBoard)
    resumed.productionRun!.allowedActions = []
    resumed.batches[0]!.stages[0]!.allowedActions = []
    const refreshed = structuredClone(testBoard)
    refreshed.batches[0]!.stages[0]!.allowedActions = ["start"]
    const loadBoard = vi.fn(async () => refreshed)

    render(
      <ProductionBoardWorkspace
        {...boardProps}
        initialBoard={resumed}
        production={makeTestProductionPort({ loadBoard })}
      />
    )

    expect(
      screen.getByLabelText("Batch 1, Sorting, planned")
    ).toBeInTheDocument()
    await waitFor(() => expect(loadBoard).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByRole("button", { name: "Start Sorting" })
    ).toBeInTheDocument()
  })

  it("submits only the server-provided run action and refreshes truth", async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async () => ({
      entityId: testBoard.productionRun!.id,
      version: 2,
      replayed: false,
    }))
    const loadBoard = vi.fn(async () => testBoard)
    render(
      <ProductionBoardWorkspace
        {...boardProps}
        production={makeTestProductionPort({ startRun, loadBoard })}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Start production run" })
    )
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        productionRunId: testBoard.productionRun!.id,
        expectedVersion: testBoard.productionRun!.version,
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
    await user.click(
      screen.getAllByRole("button", { name: "Save machines" })[0]!
    )
    expect(assignStageMachines).toHaveBeenCalledWith(
      expect.objectContaining({
        stageRunId: testBoard.batches[0]!.stages[1]!.id,
        machineIds: [testWorkspace.machines[0]!.id],
        expectedVersion: 1,
      })
    )
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
})

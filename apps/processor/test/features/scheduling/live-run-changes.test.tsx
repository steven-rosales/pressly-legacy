import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ProcessorProductionLiveRunChanges } from "@pressly/contracts/processor"
import { LiveRunChangesWorkspace } from "@/features/scheduling/live-run-changes.view"
import { requestFailure } from "@/ports/request.error"
import {
  makeTestProductionPort,
  testBoard,
  testIdempotency,
  testWorkspace,
} from "../../fixtures/production.fixture"

const orderId = "00000000-0000-4000-8000-000000000012"
const proposalHash = "d".repeat(64)
const batch = testBoard.batches[0]!

const makeLiveRunChanges = (): ProcessorProductionLiveRunChanges => ({
  productionRunId: testBoard.productionRun.id,
  queueVersion: testBoard.productionRun.queueVersion,
  pulseCapacityLbs: batch.pulseCapacityLbs,
  orders: [
    {
      id: orderId,
      externalOrderId: "C-1003",
      identity: {
        displayNumber: "C-1003",
        customerDisplayName: "Bright Hotel",
      },
      dueAt: "2026-08-01T23:00:00.000Z",
      dueBucket: "today",
      priority: true,
      derivedWeightLbs: 60,
      bagCount: 2,
      version: 3,
      placement: {
        status: "awaiting_run",
        reason: "automatic_placement_not_attempted",
        message: "Automatic placement has not completed.",
      },
      recommendedPlacement: {
        status: "available",
        placement: {
          mode: "automatic",
          target: {
            kind: "existing_batch",
            productionBatchId: batch.id,
            sequence: batch.sequence,
          },
          expectedBatchVersion: batch.version,
          allowedActions: ["place_automatically"],
          proposalHash,
          expectedQueueVersion: testBoard.productionRun.queueVersion,
          expectedOrderVersion: 3,
          capacity: {
            beforeLbs: 120,
            afterLbs: 180,
            limitLbs: 200,
          },
          projectedCompletionAt: "2026-08-01T19:00:00.000Z",
          overtime: {
            required: false,
            minutes: 0,
            shiftEndsAt: testBoard.productionShift.endsAt,
          },
        },
      },
      exactBatchTargets: [
        {
          mode: "manager_exact",
          target: {
            kind: "existing_batch",
            productionBatchId: batch.id,
            sequence: batch.sequence,
          },
          expectedBatchVersion: batch.version,
          allowedActions: ["place_exactly"],
          proposalHash,
          expectedQueueVersion: testBoard.productionRun.queueVersion,
          expectedOrderVersion: 3,
          capacity: {
            beforeLbs: 120,
            afterLbs: 180,
            limitLbs: 200,
          },
          projectedCompletionAt: "2026-08-01T19:00:00.000Z",
          overtime: {
            required: false,
            minutes: 0,
            shiftEndsAt: testBoard.productionShift.endsAt,
          },
        },
      ],
    },
  ],
})

const baseProps = {
  idempotency: testIdempotency,
  locationId: testWorkspace.location.id,
  timezone: testWorkspace.location.timezone,
  shift: testBoard.productionShift,
  productionRun: testBoard.productionRun,
  canManage: true,
  online: true,
  updatesState: "open" as const,
  onMutated: vi.fn(async () => undefined),
  onOpenProduction: vi.fn(),
  onOpenForecast: vi.fn(),
}

afterEach(() => vi.unstubAllGlobals())

describe("live run changes", () => {
  it("names the started shift and retains the remaining-day context", () => {
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={makeLiveRunChanges()}
        production={makeTestProductionPort()}
        remainingDayContext={
          <div data-testid="remaining-day-context">Remaining today</div>
        }
      />
    )

    expect(screen.getByText("Aug 1, 9:00 AM – Aug 1, 3:00 PM")).toBeVisible()
    expect(screen.getByTestId("remaining-day-context")).toBeVisible()
    expect(screen.getAllByText("1 order")).toHaveLength(2)
    expect(screen.queryByText("Queue version")).toBeNull()
  })

  it("adds at the server-recommended best fit with the projected queue version", async () => {
    const user = userEvent.setup()
    const changes = makeLiveRunChanges()
    const retryAutomaticPlacement = vi.fn(async () => ({
      status: "placed" as const,
      mode: "automatic" as const,
      productionRunId: changes.productionRunId,
      productionOrderId: orderId,
      productionBatchId: batch.id,
      createdBatch: false,
      affectedBatchIds: [batch.id],
      queueVersion: 2,
      proposalHash,
      plannedCompletionAt: "2026-08-01T19:00:00.000Z",
      overtimeMinutes: 0,
      replayed: false,
    }))
    const onMutated = vi.fn(async () => undefined)
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={changes}
        production={makeTestProductionPort({ retryAutomaticPlacement })}
        onMutated={onMutated}
      />
    )

    expect(screen.getByText("Ready to add to this run")).toBeVisible()
    expect(screen.getByText("Bright Hotel")).toBeVisible()
    expect(screen.getByText("120 → 180 of 200 lb")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "Add order C-1003 at the server-recommended best fit",
      })
    )

    expect(retryAutomaticPlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        productionRunId: changes.productionRunId,
        productionOrderId: orderId,
        expectedQueueVersion: changes.queueVersion,
      })
    )
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1))
  })

  it("lists only server-authorized exact targets in the shadcn batch picker", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const user = userEvent.setup()
    const changes = makeLiveRunChanges()
    const placeOrderExactly = vi.fn(async () => ({
      status: "placed" as const,
      mode: "manager_exact" as const,
      productionRunId: changes.productionRunId,
      productionOrderId: orderId,
      productionBatchId: batch.id,
      createdBatch: false,
      affectedBatchIds: [batch.id],
      queueVersion: 2,
      proposalHash,
      plannedCompletionAt: "2026-08-01T19:00:00.000Z",
      overtimeMinutes: 0,
      replayed: false,
    }))
    const { container } = render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={changes}
        production={makeTestProductionPort({ placeOrderExactly })}
      />
    )

    await user.click(
      screen.getByRole("button", {
        name: "Choose an authorized batch for order C-1003",
      })
    )
    expect(
      await screen.findByRole("dialog", { name: "Choose a batch" })
    ).toBeVisible()
    expect(container.querySelector("select")).toBeNull()
    const destination = screen.getByRole("combobox", {
      name: "Destination batch",
    })
    expect(destination).toHaveTextContent("Choose an authorized batch")
    expect(
      screen.getByRole("button", { name: "Add to selected batch" })
    ).toBeDisabled()

    await user.click(destination)
    await user.click(
      screen.getByRole("option", { name: "Batch 1 · 120 → 180 lb" })
    )
    await user.click(screen.getByRole("button", { name: "Add to Batch 1" }))
    expect(placeOrderExactly).toHaveBeenCalledWith(
      expect.objectContaining({
        productionBatchId: batch.id,
        expectedQueueVersion: changes.queueVersion,
        expectedBatchVersion: batch.version,
      })
    )
  })

  it("confirms only the durable overtime proposal returned by the server", async () => {
    const user = userEvent.setup()
    const changes = makeLiveRunChanges()
    const order = changes.orders[0]!
    order.recommendedPlacement = {
      status: "available",
      placement: {
        ...(order.recommendedPlacement.status === "available"
          ? order.recommendedPlacement.placement
          : (() => {
              throw new Error("Expected available placement")
            })()),
        allowedActions: ["confirm_overtime"],
        projectedCompletionAt: "2026-08-01T20:30:00.000Z",
        overtime: {
          required: true,
          minutes: 30,
          shiftEndsAt: testBoard.productionShift.endsAt,
        },
      },
    }
    order.placement = {
      status: "confirmation_required",
      mode: "automatic",
      productionRunId: changes.productionRunId,
      target: {
        kind: "existing_batch",
        productionBatchId: batch.id,
        sequence: batch.sequence,
      },
      affectedBatchIds: [batch.id],
      queueVersion: changes.queueVersion,
      proposalHash,
      projectedCompletionAt: "2026-08-01T20:30:00.000Z",
      overtimeMinutes: 30,
    }
    const confirmPlacementOvertime = vi.fn(async () => ({
      status: "placed" as const,
      mode: "automatic" as const,
      productionRunId: changes.productionRunId,
      productionOrderId: orderId,
      productionBatchId: batch.id,
      createdBatch: false,
      affectedBatchIds: [batch.id],
      queueVersion: 2,
      proposalHash,
      plannedCompletionAt: "2026-08-01T20:30:00.000Z",
      overtimeMinutes: 30,
      replayed: false,
    }))
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={changes}
        production={makeTestProductionPort({
          confirmPlacementOvertime,
        })}
      />
    )

    await user.click(
      screen.getByRole("button", {
        name: "Confirm overtime and add order C-1003 to Batch 1",
      })
    )
    expect(confirmPlacementOvertime).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedQueueVersion: changes.queueVersion,
        proposalHash,
      })
    )
  })

  it("keeps placement read-only when manager approval is missing", () => {
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        canManage={false}
        changes={makeLiveRunChanges()}
        production={makeTestProductionPort()}
      />
    )

    expect(screen.getByText("Manager approval required")).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "Add order C-1003 at the server-recommended best fit",
      })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "Choose an authorized batch for order C-1003",
      })
    ).toBeDisabled()
  })

  it("refreshes stale placement facts and asks the manager to review again", async () => {
    const user = userEvent.setup()
    const onMutated = vi.fn(async () => undefined)
    const retryAutomaticPlacement = vi.fn(async () => {
      throw requestFailure({
        requestKind: "conflict",
        code: "production_queue_version_conflict",
        message: "Queue changed.",
      })
    })
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={makeLiveRunChanges()}
        production={makeTestProductionPort({ retryAutomaticPlacement })}
        onMutated={onMutated}
      />
    )

    await user.click(
      screen.getByRole("button", {
        name: "Add order C-1003 at the server-recommended best fit",
      })
    )

    expect(
      await screen.findByText(
        "The live queue changed. Current placement options have been refreshed; review them again."
      )
    ).toBeVisible()
    expect(onMutated).toHaveBeenCalledTimes(1)
  })

  it("refreshes an exact choice after a stale batch version", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const user = userEvent.setup()
    const onMutated = vi.fn(async () => undefined)
    const placeOrderExactly = vi.fn(async () => {
      throw requestFailure({
        requestKind: "conflict",
        code: "production_batch_version_conflict",
        message: "Batch changed.",
      })
    })
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={makeLiveRunChanges()}
        production={makeTestProductionPort({ placeOrderExactly })}
        onMutated={onMutated}
      />
    )

    await user.click(
      screen.getByRole("button", {
        name: "Choose an authorized batch for order C-1003",
      })
    )
    await user.click(
      screen.getByRole("combobox", { name: "Destination batch" })
    )
    await user.click(
      screen.getByRole("option", { name: "Batch 1 · 120 → 180 lb" })
    )
    await user.click(screen.getByRole("button", { name: "Add to Batch 1" }))

    expect(
      await screen.findByText(
        "The live queue changed. Current placement options have been refreshed; review them again."
      )
    ).toBeVisible()
    expect(onMutated).toHaveBeenCalledTimes(1)
  })

  it("renders empty and projection-loading states without exposing actions", () => {
    const changes = { ...makeLiveRunChanges(), orders: [] }
    const { rerender } = render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={changes}
        production={makeTestProductionPort()}
      />
    )

    expect(screen.getByText("No ready orders are waiting")).toBeVisible()
    expect(screen.queryByText("Add at best fit")).toBeNull()

    rerender(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={null}
        production={makeTestProductionPort()}
      />
    )
    expect(screen.getByText("Placement options are refreshing")).toBeVisible()
  })

  it("uses a responsive shadcn sheet and restores focus on close", async () => {
    const user = userEvent.setup()
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={makeLiveRunChanges()}
        production={makeTestProductionPort()}
      />
    )
    const trigger = screen.getByRole("button", {
      name: "Choose an authorized batch for order C-1003",
    })
    expect(trigger).toHaveClass("w-full", "sm:w-auto")

    await user.click(trigger)
    expect(
      await screen.findByRole("dialog", { name: "Choose a batch" })
    ).toBeVisible()
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Choose a batch" })
      ).not.toBeInTheDocument()
    )
    expect(trigger).toHaveFocus()
  })

  it("renders the live placement workflow in Spanish", async () => {
    await i18next.changeLanguage("es")
    render(
      <LiveRunChangesWorkspace
        {...baseProps}
        changes={makeLiveRunChanges()}
        production={makeTestProductionPort()}
      />
    )

    expect(
      screen.getByRole("heading", {
        name: "Cambios de la corrida activa",
        level: 2,
      })
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "Agregar el pedido C-1003 en la mejor ubicación recomendada por el servidor",
      })
    ).toBeVisible()
  })
})

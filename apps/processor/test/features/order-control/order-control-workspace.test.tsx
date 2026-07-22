import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ProcessorOrderControlItem,
  ProductionBoard,
  ProductionOrderRouteProposal,
} from "@pressly/contracts"
import { OrderControlWorkspaceContainer } from "@/features/order-control/order-control-workspace.view"
import {
  makeTestProductionPort,
  testBoard,
  testIdempotency,
  testLocation,
  testOrderItems,
} from "../../fixtures/production.fixture"

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`

const inFlightOrder: ProcessorOrderControlItem = {
  order: {
    ...structuredClone(testOrderItems[0]!),
    status: "scheduled",
    derivedWeightLbs: 40,
    version: 7,
  },
  attention: null,
  currentPlacement: {
    productionRunId: testBoard.productionRun.id,
    productionBatchId: testBoard.batches[0]!.id,
    batchSequence: 0,
    batchStatus: "washing",
    batchVersion: 4,
    queueVersion: 6,
    membershipFrozen: true,
    placementProvenance: "initial_schedule",
    pinnedAt: null,
    pinnedBy: null,
  },
  nextRequiredStage: "washing",
  routeAttempts: [],
  canMoveQueued: false,
  canRouteException: true,
  canonical: null,
}

const exceptionProposal: ProductionOrderRouteProposal = {
  kind: "exception",
  productionRunId: testBoard.productionRun.id,
  productionOrderId: inFlightOrder.order.id,
  sourceProductionBatchId: testBoard.batches[0]!.id,
  sourceBatchSequence: 0,
  targetProductionBatchId: id(301),
  targetBatchSequence: 2,
  restartStage: "washing",
  releasedStages: ["washing", "drying", "folding_packaging"],
  assignedStages: ["washing", "drying", "folding_packaging"],
  orderWeightLbs: 40,
  targetWeightLbs: 160,
  targetCapacityLbs: 200,
  expectedQueueVersion: 6,
  expectedOrderVersion: 7,
  expectedSourceBatchVersion: 4,
  expectedTargetBatchVersion: 2,
  proposalHash: "e".repeat(64),
}

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
)

afterEach(() => vi.unstubAllGlobals())

describe("connected order control workspace", () => {
  it("previews and commits an in-flight leave-behind against exact versions", async () => {
    const user = userEvent.setup()
    const listOrderControl = vi.fn(async () => ({
      items: [inFlightOrder],
      counts: { attention: 1, active: 1, all: 1 },
      nextCursor: null,
      asOf: "2026-08-01T15:00:00.000Z",
    }))
    const previewOrderRoute = vi.fn(async () => exceptionProposal)
    const commitOrderRoute = vi.fn(async () => ({
      status: "routed" as const,
      proposal: exceptionProposal,
      queueVersion: 7,
      orderVersion: 8,
      sourceBatchVersion: 5,
      targetBatchVersion: 3,
      createdAttemptIds: [id(302)],
      replayed: false,
    }))
    const onMutated = vi.fn(async () => undefined)
    const production = makeTestProductionPort({
      listOrderControl,
      previewOrderRoute,
      commitOrderRoute,
    })

    render(
      <OrderControlWorkspaceContainer
        production={production}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        board={testBoard}
        revision="2026-08-01T15:00:00.000Z"
        onMutated={onMutated}
      />
    )

    await user.click(
      await screen.findByRole("button", {
        name: `Order ${inFlightOrder.order.externalOrderId}`,
      })
    )

    expect(listOrderControl).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Leave behind" }))
    await user.click(
      screen.getByRole("button", { name: "Review floor change" })
    )

    await waitFor(() =>
      expect(previewOrderRoute).toHaveBeenCalledWith({
        locationId: testLocation.id,
        productionRunId: testBoard.productionRun.id,
        productionOrderId: inFlightOrder.order.id,
        request: {
          kind: "exception",
          reason: "stage_incomplete",
          restartStage: "washing",
          expectedQueueVersion: 6,
          expectedOrderVersion: 7,
          expectedSourceBatchVersion: 4,
        },
      })
    )

    await user.click(
      await screen.findByRole("button", { name: "Confirm floor route" })
    )

    await waitFor(() => expect(commitOrderRoute).toHaveBeenCalledTimes(1))
    expect(commitOrderRoute).toHaveBeenCalledWith({
      locationId: testLocation.id,
      productionRunId: testBoard.productionRun.id,
      productionOrderId: inFlightOrder.order.id,
      request: expect.objectContaining({
        kind: "exception",
        reason: "stage_incomplete",
        restartStage: "washing",
        expectedQueueVersion: 6,
        expectedOrderVersion: 7,
        expectedSourceBatchVersion: 4,
        proposalHash: exceptionProposal.proposalHash,
        idempotencyKey: expect.stringContaining("route-order-exception"),
      }),
    })
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1))
  })

  it("keeps established orders visible while filters refresh immediately", async () => {
    const user = userEvent.setup()
    let resolveRefresh:
      | ((value: {
          items: readonly ProcessorOrderControlItem[]
          counts: { attention: number; active: number; all: number }
          nextCursor: null
          asOf: string
        }) => void)
      | undefined
    const refresh = new Promise<{
      items: readonly ProcessorOrderControlItem[]
      counts: { attention: number; active: number; all: number }
      nextCursor: null
      asOf: string
    }>((resolve) => {
      resolveRefresh = resolve
    })
    const listOrderControl = vi
      .fn()
      .mockResolvedValueOnce({
        items: [inFlightOrder],
        counts: { attention: 1, active: 1, all: 1 },
        nextCursor: null,
        asOf: "2026-08-01T15:00:00.000Z",
      })
      .mockReturnValueOnce(refresh)
    const production = makeTestProductionPort({ listOrderControl })

    render(
      <OrderControlWorkspaceContainer
        production={production}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        board={testBoard}
        revision="2026-08-01T15:00:00.000Z"
        onMutated={async () => undefined}
      />
    )

    const orderButton = await screen.findByRole("button", {
      name: `Order ${inFlightOrder.order.externalOrderId}`,
    })
    await user.selectOptions(screen.getByLabelText("Order status"), "scheduled")

    await waitFor(() => expect(listOrderControl).toHaveBeenCalledTimes(2))
    expect(orderButton).toBeInTheDocument()
    expect(screen.queryByLabelText("Loading orders")).not.toBeInTheDocument()
    expect(screen.getByText("Updating")).toBeInTheDocument()

    resolveRefresh?.({
      items: [],
      counts: { attention: 0, active: 0, all: 0 },
      nextCursor: null,
      asOf: "2026-08-01T15:01:00.000Z",
    })
    expect(
      await screen.findByRole("heading", { name: "No orders need attention" })
    ).toBeInTheDocument()
  })

  it("sends a semantic due bucket instead of browser-local timestamps", async () => {
    const user = userEvent.setup()
    const listOrderControl = vi.fn(async () => ({
      items: [inFlightOrder],
      counts: { attention: 1, active: 1, all: 1 },
      nextCursor: null,
      asOf: "2026-08-01T15:00:00.000Z",
    }))
    const production = makeTestProductionPort({ listOrderControl })

    render(
      <OrderControlWorkspaceContainer
        production={production}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        board={testBoard}
        revision="2026-08-01T15:00:00.000Z"
        onMutated={async () => undefined}
      />
    )

    await screen.findByRole("button", {
      name: `Order ${inFlightOrder.order.externalOrderId}`,
    })
    await user.selectOptions(screen.getByLabelText("Due window"), "overdue")

    await waitFor(() => expect(listOrderControl).toHaveBeenCalledTimes(2))
    expect(listOrderControl).toHaveBeenLastCalledWith({
      locationId: testLocation.id,
      query: expect.objectContaining({ dueBucket: "overdue" }),
    })
    expect(listOrderControl).not.toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ dueAfter: expect.anything() }),
      })
    )
    expect(listOrderControl).not.toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ dueBefore: expect.anything() }),
      })
    )
  })

  it("labels unfinished past work as past due and completed work as finished", async () => {
    const pastDueOrder: ProcessorOrderControlItem = {
      order: {
        ...structuredClone(testOrderItems[0]!),
        id: id(501),
        externalOrderId: "PAST-DUE",
        dueAt: "2026-07-16T21:00:00.000Z",
        dueBucket: "overdue",
      },
      attention: null,
      currentPlacement: null,
      nextRequiredStage: "sorting",
      routeAttempts: [],
      canMoveQueued: false,
      canRouteException: false,
      canonical: null,
    }
    const finishedOrder: ProcessorOrderControlItem = {
      ...pastDueOrder,
      order: {
        ...pastDueOrder.order,
        id: id(502),
        externalOrderId: "FINISHED",
        status: "finished",
      },
      nextRequiredStage: null,
    }
    const production = makeTestProductionPort({
      listOrderControl: async () => ({
        items: [pastDueOrder, finishedOrder],
        counts: { attention: 0, active: 0, all: 2 },
        nextCursor: null,
        asOf: "2026-08-01T15:00:00.000Z",
      }),
    })

    render(
      <OrderControlWorkspaceContainer
        production={production}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        board={testBoard}
        revision="2026-08-01T15:00:00.000Z"
        onMutated={async () => undefined}
      />
    )

    const pastDueRow = (
      await screen.findByRole("button", { name: "Order PAST-DUE" })
    ).closest("tr")
    const finishedRow = screen
      .getByRole("button", { name: "Order FINISHED" })
      .closest("tr")

    expect(pastDueRow).not.toBeNull()
    expect(finishedRow).not.toBeNull()
    expect(within(pastDueRow!).getByText("Past due")).toBeInTheDocument()
    expect(within(finishedRow!).getAllByText("Finished")).not.toHaveLength(0)
  })

  it("labels pre-release demand as forecast only", async () => {
    const waitingOrder: ProcessorOrderControlItem = {
      order: {
        ...structuredClone(testOrderItems[0]!),
        status: "release_pending",
        bagCount: null,
        bagCountProvenance: null,
        intakeVersion: null,
      },
      attention: null,
      currentPlacement: null,
      nextRequiredStage: null,
      routeAttempts: [],
      canMoveQueued: false,
      canRouteException: false,
      canonical: null,
    }
    const production = makeTestProductionPort({
      listOrderControl: async () => ({
        items: [waitingOrder],
        counts: { attention: 0, active: 0, all: 1 },
        nextCursor: null,
        asOf: "2026-08-01T15:00:00.000Z",
      }),
    })

    render(
      <OrderControlWorkspaceContainer
        production={production}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        board={testBoard}
        revision="2026-08-01T15:00:00.000Z"
        onMutated={async () => undefined}
      />
    )

    const waitingRow = (
      await screen.findByRole("button", {
        name: `Order ${waitingOrder.order.externalOrderId}`,
      })
    ).closest("tr")
    expect(waitingRow).not.toBeNull()
    expect(
      within(waitingRow!).getByText("Customer unavailable")
    ).toBeInTheDocument()
    expect(within(waitingRow!).getByText("Forecast only")).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Forecast only" })
    ).toBeInTheDocument()
  })

  it("shows canonical customer and source-versus-floor context without exposing source-specific primary state", async () => {
    const user = userEvent.setup()
    const composedOrder: ProcessorOrderControlItem = {
      ...inFlightOrder,
      attention: {
        reason: "source_comparison_required",
        message: "Commercial complete; floor work remains.",
      },
      canonical: {
        canonicalOrderId: id(601),
        canonicalFulfillmentId: id(602),
        displayNumber: "P-1001",
        customer: {
          resolution: "resolved",
          userId: id(603),
          firstName: "Ada",
          lastName: "Rivera",
          businessName: null,
          phone: "+12015550101",
        },
        commercialState: "completed",
        admissionState: "released",
        source: { name: "cents", status: "COMPLETED" },
        comparison: "source_ahead",
      },
    }
    const production = makeTestProductionPort({
      listOrderControl: async () => ({
        items: [composedOrder],
        counts: { attention: 1, active: 1, all: 1 },
        nextCursor: null,
        asOf: "2026-08-01T15:00:00.000Z",
      }),
    })

    render(
      <OrderControlWorkspaceContainer
        production={production}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        board={testBoard}
        revision="2026-08-01T15:00:00.000Z"
        onMutated={async () => undefined}
      />
    )

    const row = (
      await screen.findByRole("button", { name: "Order P-1001" })
    ).closest("tr")
    expect(row).not.toBeNull()
    expect(within(row!).getByText("Ada Rivera")).toBeInTheDocument()
    expect(
      within(row!).getByText("Systems need confirmation")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Order P-1001" }))
    expect(
      screen.getByRole("heading", { name: "Customer and order" })
    ).toBeInTheDocument()
    expect(screen.getByText("+12015550101")).toBeInTheDocument()
    expect(
      screen.getByText("Commercial complete; floor unfinished")
    ).toBeInTheDocument()
    expect(screen.getByText("cents · COMPLETED")).toBeInTheDocument()
  })

  it("loads the order's own run before offering cross-workspace move targets", async () => {
    const user = userEvent.setup()
    const sourceRunId = id(401)
    const sourceBatchId = id(402)
    const targetBatchId = id(403)
    const queuedOrder: ProcessorOrderControlItem = {
      order: {
        ...structuredClone(testOrderItems[1]!),
        status: "scheduled",
        derivedWeightLbs: 50,
        version: 3,
      },
      attention: null,
      currentPlacement: {
        productionRunId: sourceRunId,
        productionBatchId: sourceBatchId,
        batchSequence: 0,
        batchStatus: "queued",
        batchVersion: 2,
        queueVersion: 5,
        membershipFrozen: false,
        placementProvenance: "automatic",
        pinnedAt: null,
        pinnedBy: null,
      },
      nextRequiredStage: "sorting",
      routeAttempts: [],
      canMoveQueued: true,
      canRouteException: false,
      canonical: null,
    }
    const sourceBatch = {
      ...structuredClone(testBoard.batches[0]!),
      id: sourceBatchId,
      sequence: 0,
      derivedWeightLbs: 50,
      orders: [],
      version: 2,
    }
    const targetBatch = {
      ...structuredClone(testBoard.batches[0]!),
      id: targetBatchId,
      sequence: 1,
      derivedWeightLbs: 80,
      orders: [],
      version: 3,
    }
    const sourceBoard: ProductionBoard = {
      ...structuredClone(testBoard),
      productionRun: {
        ...structuredClone(testBoard.productionRun),
        id: sourceRunId,
        queueVersion: 5,
      },
      batches: [sourceBatch, targetBatch],
    }
    const loadBoard = vi.fn(async () => sourceBoard)
    const production = makeTestProductionPort({
      listOrderControl: async () => ({
        items: [queuedOrder],
        counts: { attention: 0, active: 1, all: 1 },
        nextCursor: null,
        asOf: "2026-08-01T15:00:00.000Z",
      }),
      loadBoard,
    })

    render(
      <OrderControlWorkspaceContainer
        production={production}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        board={testBoard}
        revision="2026-08-01T15:00:00.000Z"
        onMutated={async () => undefined}
      />
    )

    await user.click(
      await screen.findByRole("button", {
        name: `Order ${queuedOrder.order.externalOrderId}`,
      })
    )
    await user.click(
      screen.getByRole("button", { name: "Move to queued batch" })
    )

    await waitFor(() =>
      expect(loadBoard).toHaveBeenCalledWith(testLocation.id, sourceRunId)
    )
    expect(
      await screen.findByRole("option", { name: /Batch 2 · 80 \/ 200 lb/ })
    ).toBeEnabled()
    expect(screen.getByLabelText("Destination batch")).toHaveValue(
      targetBatchId
    )
    expect(screen.getByRole("button", { name: "Review move" })).toBeEnabled()
  })
})

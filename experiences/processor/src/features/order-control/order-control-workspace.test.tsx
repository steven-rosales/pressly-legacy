import { screen, waitFor, within } from "@testing-library/react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { processorOrderControlFeature } from "./feature"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProcessorOrderControlItem } from "../../contracts/production-order-control.ts"
import type { ProductionOrderRouteProposal } from "@pressly/production-system/contracts/read-models/production-order-control"
import { OrderControlWorkspaceContainer } from "./order-control-workspace.view"
import { renderWithProcessorBrowserCapabilities as render } from "../../../test/support/browser-capabilities.fixture.tsx"
import {
  makeTestProductionPort,
  testBoard,
  testIdempotency,
  testLocation,
  testOrderItems,
} from "../../../test/fixtures/production.fixture"

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`

const unavailableCommands = {
  queuedMove: {
    status: "blocked",
    code: "PRODUCTION_ORDER_NOT_SCHEDULED",
    targets: [],
  },
  routeException: {
    status: "blocked",
    code: "PRODUCTION_ORDER_NOT_SCHEDULED",
  },
} satisfies ProcessorOrderControlItem["commands"]

const inFlightOrder: ProcessorOrderControlItem = {
  order: {
    ...structuredClone(testOrderItems[0]!),
    status: "scheduled",
    derivedWeightLbs: 40,
    version: 7,
  },
  identity: testOrderItems[0]!.identity,
  admission: {
    sourceState: "released",
    override: null,
    effectiveState: "released",
    allowedActions: [],
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
  commands: {
    queuedMove: {
      status: "blocked",
      code: "QUEUED_REBATCH_SOURCE_NOT_QUEUED",
      targets: [],
    },
    routeException: {
      status: "allowed",
      expectedQueueVersion: 6,
      expectedOrderVersion: 7,
      expectedSourceBatchVersion: 4,
    },
  },
  resolutionAction: {
    status: "blocked",
    reasons: ["execution_committed"],
  },
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
  proveExperienceFeature({
    featureId: "processor.order-control",
    feature: processorOrderControlFeature,
    scenarios: [
      {
        name: "previews and commits an in-flight leave-behind against exact versions",
        proves: ["presentation-state", "component-interaction"],
        run: async () => {
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
          expect(
            screen.getByText(
              "A normal move requires the current batch to still be queued."
            )
          ).toBeInTheDocument()

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
        },
      },
    ],
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
      identity: {
        displayNumber: "PAST-DUE",
        customerDisplayName: null,
      },
      admission: {
        sourceState: "released",
        override: null,
        effectiveState: "released",
        allowedActions: [],
      },
      attention: null,
      currentPlacement: null,
      nextRequiredStage: "sorting",
      routeAttempts: [],
      commands: unavailableCommands,
      resolutionAction: {
        status: "allowed",
        expectedVersion: testOrderItems[0]!.version,
        requiresExplicitReview: false,
        reviewReasons: [],
      },
      canonical: null,
    }
    const finishedOrder: ProcessorOrderControlItem = {
      ...pastDueOrder,
      identity: {
        displayNumber: "FINISHED",
        customerDisplayName: null,
      },
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
      identity: {
        displayNumber: testOrderItems[0]!.identity.displayNumber,
        customerDisplayName: null,
      },
      admission: {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: ["release"],
      },
      attention: null,
      currentPlacement: null,
      nextRequiredStage: null,
      routeAttempts: [],
      commands: unavailableCommands,
      resolutionAction: {
        status: "allowed",
        expectedVersion: testOrderItems[0]!.version,
        requiresExplicitReview: false,
        reviewReasons: [],
      },
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

  it("shows canonical customer details without source-authority presentation", async () => {
    const user = userEvent.setup()
    const composedOrder: ProcessorOrderControlItem = {
      ...inFlightOrder,
      identity: {
        displayNumber: "P-1001",
        customerDisplayName: "Ada Rivera",
      },
      attention: null,
      canonical: {
        canonicalOrderId: id(601),
        canonicalFulfillmentId: id(602),
        versions: {
          order: 4,
          fulfillment: 3,
        },
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
        source: {
          name: "cents",
        },
        audit: [],
      },
    }
    const production = makeTestProductionPort({
      listOrderControl: async () => ({
        items: [composedOrder],
        counts: { attention: 0, active: 1, all: 1 },
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
      within(row!).queryByText("Systems need confirmation")
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Order P-1001" }))
    expect(
      screen.getByRole("heading", { name: "Customer and order" })
    ).toBeInTheDocument()
    expect(screen.getByText("+12015550101")).toBeInTheDocument()
    expect(screen.queryByText("COMPLETED")).toBeNull()
  })

  it("archives an individual active order through Production-owned availability", async () => {
    const user = userEvent.setup()
    const order: ProcessorOrderControlItem = {
      order: {
        ...structuredClone(testOrderItems[0]!),
        externalOrderId: "21122",
        status: "intake_pending",
        version: 9,
      },
      identity: {
        displayNumber: "21122",
        customerDisplayName: "Santiago Jackson",
      },
      admission: {
        sourceState: "released",
        override: null,
        effectiveState: "released",
        allowedActions: [],
      },
      attention: {
        reason: "intake_required",
        message: "Intake is required.",
      },
      currentPlacement: null,
      nextRequiredStage: null,
      routeAttempts: [],
      commands: unavailableCommands,
      resolutionAction: {
        status: "allowed",
        expectedVersion: 9,
        requiresExplicitReview: true,
        reviewReasons: ["intake_recorded"],
      },
      canonical: {
        canonicalOrderId: id(701),
        canonicalFulfillmentId: id(702),
        versions: {
          order: 5,
          fulfillment: 4,
        },
        displayNumber: "21122",
        customer: {
          resolution: "resolved",
          userId: id(703),
          firstName: "Santiago",
          lastName: "Jackson",
          businessName: null,
          phone: "+18622917798",
        },
        commercialState: "open",
        admissionState: "released",
        source: {
          name: "cents",
        },
        audit: [
          {
            kind: "source_observation",
            code: "source_observation",
            occurredAt: "2026-07-27T23:04:00.000Z",
            actor: "cents",
            outcome: null,
          },
        ],
      },
    }
    const changeOrderResolution = vi.fn(async () => ({
      locationId: testLocation.id,
      orderId: order.order.id,
      action: "resolve_without_production" as const,
      resolutionState: "resolved_without_production" as const,
      transitionedAt: "2026-08-01T15:01:00.000Z",
      version: 10,
      replayed: false,
    }))
    const onMutated = vi.fn(async () => undefined)
    const production = makeTestProductionPort({
      listOrderControl: async () => ({
        items: [order],
        counts: { attention: 1, active: 0, all: 1 },
        nextCursor: null,
        asOf: "2026-08-01T15:00:00.000Z",
      }),
      changeOrderResolution,
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

    await user.click(await screen.findByRole("button", { name: "Order 21122" }))
    await user.click(
      screen.getByRole("button", { name: "Archive from active work" })
    )
    expect(screen.getAllByText("Santiago Jackson").length).toBeGreaterThan(0)
    expect(
      screen.getByText("Physical intake has been recorded.")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: "Review archive" }))

    const confirmation = screen.getByRole("alertdialog")
    expect(
      within(confirmation).getByText("Archive order 21122?")
    ).toBeInTheDocument()
    await user.click(
      within(confirmation).getByRole("button", {
        name: "Archive from active work",
      })
    )

    await waitFor(() =>
      expect(changeOrderResolution).toHaveBeenCalledWith({
        locationId: testLocation.id,
        productionOrderId: order.order.id,
        request: {
          action: "resolve_without_production",
          reason: "order_will_not_be_produced",
          note: null,
          confirmReviewedFacts: true,
          expectedVersion: 9,
          idempotencyKey: expect.stringContaining(
            "test:resolve-production-order:"
          ),
        },
      })
    )
    expect(onMutated).toHaveBeenCalledOnce()
  })

  it("uses server-owned move targets without re-deriving them from a board", async () => {
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
      identity: testOrderItems[1]!.identity,
      admission: {
        sourceState: "released",
        override: null,
        effectiveState: "released",
        allowedActions: [],
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
      commands: {
        queuedMove: {
          status: "allowed",
          expectedQueueVersion: 5,
          expectedOrderVersion: 3,
          expectedSourceBatchVersion: 2,
          targets: [
            {
              productionBatchId: sourceBatchId,
              batchSequence: 0,
              batchStatus: "queued",
              membershipFrozen: false,
              expectedBatchVersion: 2,
              currentWeightLbs: 50,
              projectedWeightLbs: 100,
              capacityLbs: 200,
              feasibility: {
                status: "blocked",
                code: "TARGET_IS_SOURCE_BATCH",
              },
            },
            {
              productionBatchId: targetBatchId,
              batchSequence: 1,
              batchStatus: "queued",
              membershipFrozen: false,
              expectedBatchVersion: 3,
              currentWeightLbs: 80,
              projectedWeightLbs: 130,
              capacityLbs: 200,
              feasibility: { status: "allowed" },
            },
          ],
        },
        routeException: {
          status: "blocked",
          code: "EXCEPTION_SOURCE_NOT_IN_FLIGHT",
        },
      },
      resolutionAction: {
        status: "blocked",
        reasons: ["batch_membership_exists"],
      },
      canonical: null,
    }
    const loadBoard = vi.fn()
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

    expect(loadBoard).not.toHaveBeenCalled()
    expect(
      await screen.findByRole("option", {
        name: /Batch 2 · 80 → 130 of 200 lb/,
      })
    ).toBeEnabled()
    expect(screen.getByLabelText("Destination batch")).toHaveValue(
      targetBatchId
    )
    expect(screen.getByRole("button", { name: "Review move" })).toBeEnabled()
  })
})

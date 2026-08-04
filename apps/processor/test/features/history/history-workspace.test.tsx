import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProcessorProductionHistoryActivityEntry } from "@pressly/contracts/processor"
import type { ProductionHistoryRunSummary } from "@pressly/contracts/production"
import { HistoryWorkspaceContainer } from "@/features/history/history-workspace.view"
import {
  makeTestProductionPort,
  testBoard,
  testLocation,
  testShift,
} from "../../fixtures/production.fixture"

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`

const run: ProductionHistoryRunSummary = {
  productionRunId: testBoard.productionRun.id,
  productionShiftId: testShift.id,
  scheduleRunId: id(501),
  status: "completed",
  shiftStartsAt: testShift.startsAt,
  shiftEndsAt: testShift.endsAt,
  timezone: testLocation.timezone,
  startedAt: testShift.startsAt,
  completedAt: "2026-08-01T19:30:00.000Z",
  plannedCompletionAt: "2026-08-01T19:45:00.000Z",
  batchCount: 4,
  completedBatchCount: 4,
  orderCount: 15,
  priorityOrderCount: 2,
  totalWeightLbs: 800,
  queueVersion: 8,
  overtimeAcknowledged: false,
  createdAt: "2026-08-01T13:55:00.000Z",
}

const activity: ProcessorProductionHistoryActivityEntry = {
  id: id(502),
  eventType: "production_order_rebatched",
  entityType: "production_order",
  entityId: id(503),
  identity: {
    displayNumber: "TEST-503",
    customerDisplayName: "Rivera Cleaners",
  },
  actor: { id: id(504), kind: "user", displayName: "Jamie Operator" },
  expectedVersion: 2,
  productionRunId: run.productionRunId,
  resolutionAction: null,
  summary: "Order moved to a later batch",
  details: {
    kind: "order",
    productionRunId: run.productionRunId,
    sourceBatchId: id(505),
    targetBatchId: id(506),
    outcome: "routed",
    bagCount: 3,
    priority: false,
    queueVersion: 8,
    version: 3,
    resolutionState: null,
    resolutionReason: null,
    routeReason: "manual_rebatch",
    restartStage: "sorting",
    releasedStages: ["sorting"],
    assignedStages: ["sorting", "washing", "drying", "folding_packaging"],
  },
  occurredAt: "2026-08-01T16:00:00.000Z",
}

describe("connected production history workspace", () => {
  it("sends search and status to the server and resets status for activity", async () => {
    const user = userEvent.setup()
    const listHistoryRuns = vi.fn(async () => ({
      items: [run],
      nextCursor: null,
      asOf: "2026-08-01T20:00:00.000Z",
    }))
    const listHistoryActivity = vi.fn(async () => ({
      items: [activity],
      nextCursor: null,
      asOf: "2026-08-01T20:00:00.000Z",
    }))
    const production = makeTestProductionPort({
      listHistoryRuns,
      listHistoryActivity,
    })

    render(
      <HistoryWorkspaceContainer
        production={production}
        idempotency={{
          key: vi.fn(async () => "history-idempotency-key"),
        }}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        revision="2026-08-01T20:00:00.000Z"
        canManage={false}
        onMutated={vi.fn(async () => undefined)}
      />
    )

    expect(
      await screen.findByRole("button", {
        name: "Production run",
      })
    ).toBeInTheDocument()
    expect(listHistoryRuns).toHaveBeenLastCalledWith({
      locationId: testLocation.id,
      query: { limit: 50 },
    })

    await user.type(screen.getByLabelText("Search history"), "north")
    await waitFor(() =>
      expect(listHistoryRuns).toHaveBeenLastCalledWith({
        locationId: testLocation.id,
        query: { limit: 50, search: "north" },
      })
    )

    await user.selectOptions(
      screen.getByLabelText("History status"),
      "completed"
    )
    await waitFor(() =>
      expect(listHistoryRuns).toHaveBeenLastCalledWith({
        locationId: testLocation.id,
        query: { limit: 50, search: "north", status: "completed" },
      })
    )

    await user.click(screen.getByRole("tab", { name: "Activity" }))
    await waitFor(() =>
      expect(listHistoryActivity).toHaveBeenLastCalledWith({
        locationId: testLocation.id,
        query: { limit: 50, search: "north" },
      })
    )
    expect(screen.getByLabelText("History status")).toHaveValue("all")
    expect(screen.getByText("Order moved to a later batch")).toBeInTheDocument()
  })

  it("names the restored order in the success notice", async () => {
    const user = userEvent.setup()
    const restorableActivity: ProcessorProductionHistoryActivityEntry = {
      ...activity,
      resolutionAction: { action: "restore", expectedVersion: 3 },
    }
    const changeOrderResolution = vi.fn(async () => ({
      locationId: testLocation.id,
      orderId: activity.entityId,
      action: "restore" as const,
      resolutionState: "open" as const,
      transitionedAt: "2026-08-01T20:01:00.000Z",
      version: 4,
      replayed: false,
    }))
    const production = makeTestProductionPort({
      listHistoryActivity: async () => ({
        items: [restorableActivity],
        nextCursor: null,
        asOf: "2026-08-01T20:00:00.000Z",
      }),
      changeOrderResolution,
    })

    render(
      <HistoryWorkspaceContainer
        production={production}
        idempotency={{
          key: vi.fn(async () => "history-restore-idempotency-key"),
        }}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        revision="2026-08-01T20:00:00.000Z"
        canManage
        onMutated={vi.fn(async () => undefined)}
      />
    )

    await user.click(screen.getByRole("tab", { name: "Activity" }))
    await user.click(
      await screen.findByRole("button", { name: "Restore to active work" })
    )
    await user.click(screen.getByLabelText("Why is this order being restored?"))
    await user.click(screen.getByText("Correct a manager decision"))
    await user.click(
      screen.getByRole("button", { name: "Restore to active work" })
    )

    expect(
      await screen.findByText("Order TEST-503 is back in active work.")
    ).toBeInTheDocument()
    expect(changeOrderResolution).toHaveBeenCalledTimes(1)
  })
})

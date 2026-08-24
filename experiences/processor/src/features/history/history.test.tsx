import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  HistoryCallbacks,
  HistoryRunDetail,
  HistoryViewModel,
} from "./history.model"
import { HistoryWorkspace } from "./history.view"

const run = {
  id: "run-1",
  title: "Run Jul 14",
  shiftLabel: "Jul 14 · 8:00 AM–4:00 PM",
  statusLabel: "Completed",
  status: "completed" as const,
  demandLabel: "800 lb · 34 bags",
  batchesLabel: "4 batches · 15 orders",
  timingLabel: "Planned 6 hr 32 min · actual 6 hr 18 min",
  exceptionLabel: "1 leave-behind",
  overtimeLabel: null,
}

const activity = {
  id: "event-1",
  identity: null,
  title: "Order moved to Batch 3",
  detail: "Order 1001 was recorded as left behind during washing.",
  occurredAtLabel: "2:14 PM",
  actorLabel: "Jamie Operator",
  entityLabel: "Order 1001",
  tone: "warning" as const,
  restoreAction: null,
}

const plan = {
  id: "plan-1",
  revisionLabel: "Schedule revision 3",
  shiftLabel: "Jul 14 · morning shift",
  statusLabel: "Accepted",
  status: "accepted" as const,
  computedAtLabel: "7:42 AM",
  acceptedAtLabel: "7:45 AM",
  warningsLabel: "No warnings",
  productionRunId: "run-1",
}

const runDetail: HistoryRunDetail = {
  id: "run-1",
  title: "Run Jul 14",
  shiftLabel: "Jul 14 · 8:00 AM–4:00 PM",
  statusLabel: "Completed",
  demandLabel: "800 lb · 34 bags",
  batchCountLabel: "4 batches · 15 orders",
  plannedTimingLabel: "8:00 AM–2:32 PM",
  actualTimingLabel: "8:02 AM–2:20 PM",
  exceptionLabel: "1 leave-behind",
  batches: [
    {
      id: "batch-1",
      label: "Batch 1",
      statusLabel: "Finished",
      demandLabel: "214 lb · 4 orders",
      timingLabel: "8:02 AM–11:46 AM",
      exceptionLabel: null,
    },
  ],
  orders: [
    {
      id: "order-1",
      identity: {
        displayNumber: "1001",
        customerDisplayName: "Ada Rivera",
      },
      externalOrderId: "1001",
      statusLabel: "Finished",
      demandLabel: "54 lb · 3 bags",
      batchLabel: "Batch 3",
    },
  ],
  activity: [activity],
  plans: [plan],
}

const baseModel: HistoryViewModel = {
  tab: "runs",
  filters: { query: "", dateWindow: "all", status: "all" },
  dateOptions: [
    { value: "all", label: "Any date" },
    { value: "30_days", label: "Last 30 days" },
  ],
  statusOptions: [
    { value: "all", label: "Any status" },
    { value: "completed", label: "Completed" },
  ],
  runs: [run],
  activity: [activity],
  plans: [plan],
  page: {
    rangeLabel: "Showing 1–25 runs",
    previousCursor: null,
    nextCursor: "next-history",
  },
  asOfLabel: "Updated just now.",
  selectedRun: null,
  loading: false,
  refreshing: false,
  error: null,
  canManage: false,
  restoringOrderId: null,
  restoreError: null,
  restoreNotice: null,
}

const makeCallbacks = (): HistoryCallbacks => ({
  onTabChange: vi.fn(),
  onFiltersChange: vi.fn(),
  onClearFilters: vi.fn(),
  onPreviousPage: vi.fn(),
  onNextPage: vi.fn(),
  onOpenRun: vi.fn(),
  onCloseRun: vi.fn(),
  onRestoreOrder: vi.fn(),
})

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

describe("production history workspace", () => {
  it("separates runs, activity, and plans while exposing cursor navigation", async () => {
    const user = userEvent.setup()
    const callbacks = makeCallbacks()
    render(
      <HistoryWorkspace
        model={baseModel}
        callbacks={callbacks}
        isMobile={false}
      />
    )

    await user.click(screen.getByRole("tab", { name: "Activity" }))
    expect(callbacks.onTabChange).toHaveBeenCalledWith("activity")
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(callbacks.onNextPage).toHaveBeenCalledWith("next-history")
    await user.click(screen.getByRole("button", { name: "Run Jul 14" }))
    expect(callbacks.onOpenRun).toHaveBeenCalledWith("run-1")
  })

  it("keeps settled history in place during a background refresh", () => {
    render(
      <HistoryWorkspace
        model={{ ...baseModel, refreshing: true }}
        callbacks={makeCallbacks()}
        isMobile={false}
      />
    )

    expect(screen.getByRole("button", { name: "Run Jul 14" })).toBeVisible()
    expect(screen.getByText("Updating")).toBeVisible()
    expect(screen.queryByLabelText("Loading history")).not.toBeInTheDocument()
  })

  it("renders a mobile run record with batches, orders, activity, and plan lineage", async () => {
    const user = userEvent.setup()
    const callbacks = makeCallbacks()
    render(
      <HistoryWorkspace
        model={{ ...baseModel, selectedRun: runDetail }}
        callbacks={callbacks}
        isMobile
      />
    )

    const sheet = document.querySelector('[data-slot="sheet-content"]')
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet).toHaveAttribute("data-size", "workspace")
    expect(sheet).toHaveClass(
      "overflow-hidden",
      "data-[side=bottom]:h-[calc(100dvh-0.5rem)]"
    )
    const detailTabs = within(sheet as HTMLElement).getByRole("tablist")
    expect(detailTabs).toHaveClass("w-full", "grid-cols-5")
    expect(detailTabs).not.toHaveClass("min-w-[520px]")
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveClass(
      "min-w-0",
      "text-xs"
    )
    await user.click(screen.getByRole("tab", { name: "Orders" }))
    expect(screen.getByText("Order 1001")).toBeVisible()
    expect(screen.getByText("Ada Rivera")).toBeVisible()
    await user.click(screen.getByRole("tab", { name: "Activity" }))
    expect(screen.getByText("Order moved to Batch 3")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Plans" }))
    expect(screen.getByText("Schedule revision 3")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Close history" }))
    expect(callbacks.onCloseRun).toHaveBeenCalled()
  })

  it("lets a manager restore an archived order from its identifiable activity row", async () => {
    const user = userEvent.setup()
    const callbacks = makeCallbacks()
    render(
      <HistoryWorkspace
        model={{
          ...baseModel,
          tab: "activity",
          canManage: true,
          runs: [],
          activity: [
            {
              ...activity,
              title: "Archived from active work",
              identity: {
                displayNumber: "TEST-1001",
                customerDisplayName: "Rivera Cleaners",
              },
              restoreAction: {
                productionOrderId: "order-1",
                expectedVersion: 7,
              },
            },
          ],
        }}
        callbacks={callbacks}
        isMobile={false}
      />
    )

    expect(screen.getByText("Order TEST-1001")).toBeVisible()
    expect(screen.getByText("Rivera Cleaners")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Restore to active work" })
    )
    await user.click(screen.getByLabelText("Why is this order being restored?"))
    await user.click(screen.getByText("Correct a manager decision"))
    await user.click(
      screen.getByRole("button", { name: "Restore to active work" })
    )

    expect(callbacks.onRestoreOrder).toHaveBeenCalledWith({
      productionOrderId: "order-1",
      expectedVersion: 7,
      reason: "manager_correction",
      note: null,
    })
  })
})

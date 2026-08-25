import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  OrderControlCallbacks,
  OrderControlOrder,
  OrderControlViewModel,
} from "./order-control.model"
import {
  OrderAttentionSummary,
  OrderControlWorkspace,
} from "./order-control.view"

const order: OrderControlOrder = {
  id: "order-1",
  identity: {
    displayNumber: "1001",
    customerDisplayName: "Ada Rivera",
  },
  externalOrderId: "1001",
  secondaryLabel: "Route North",
  customerLabel: "Ada Rivera",
  phoneLabel: "(201) 555-0101",
  commercialStateLabel: "Open",
  admissionStateLabel: "Released to production",
  statusLabel: "Scheduled",
  dueLabel: "Today",
  dueDetail: "Due by 5:00 PM",
  weightLabel: "54 lb",
  bagLabel: "3 bags",
  priority: true,
  attention: {
    label: "Left behind",
    detail: "This order needs a later washing batch.",
    tone: "warning",
  },
  audit: [],
  position: {
    label: "Batch 2",
    detail: "Washing · membership frozen",
    state: "in_progress",
    batchId: "batch-2",
    batchLabel: "Batch 2",
    stageLabel: "Washing",
    membership: "frozen",
  },
  placement: {
    label: "Manager placement",
    detail: "Pinned to Batch 2",
    pinned: true,
  },
  lastUpdatedLabel: "2 min ago",
  move: { available: false, reason: "Only queued work can move normally." },
  leaveBehind: { available: true, reason: null },
  rework: { available: true, reason: null },
  archive: {
    available: false,
    reason: "Production work has already started.",
    expectedVersion: null,
    requiresExplicitReview: false,
    reviewReasons: [],
  },
}

const filterOptions = {
  statuses: [
    { value: "all", label: "All statuses" },
    { value: "scheduled", label: "Scheduled" },
  ],
  dueWindows: [
    { value: "all", label: "Any due date" },
    { value: "today", label: "Due today" },
  ],
  stages: [
    { value: "all", label: "Any stage" },
    { value: "washing", label: "Washing" },
  ],
  priorities: [
    { value: "all", label: "Any priority" },
    { value: "priority", label: "Priority only" },
  ],
} as const

const baseModel: OrderControlViewModel = {
  tab: "needs_attention",
  counts: { needsAttention: 1, active: 14, all: 34 },
  filters: {
    query: "",
    status: "all",
    due: "all",
    stage: "all",
    priority: "all",
  },
  filterOptions,
  orders: [order],
  page: {
    rangeLabel: "Showing 1–25 orders",
    previousCursor: null,
    nextCursor: "next-orders",
  },
  asOfLabel: "Updated just now.",
  selectedOrder: null,
  detailAction: { kind: "none" },
  loading: false,
  refreshing: false,
  error: null,
}

const makeCallbacks = (): OrderControlCallbacks => ({
  onTabChange: vi.fn(),
  onFiltersChange: vi.fn(),
  onClearFilters: vi.fn(),
  onPreviousPage: vi.fn(),
  onNextPage: vi.fn(),
  onOpenOrder: vi.fn(),
  onCloseOrder: vi.fn(),
  onStartMove: vi.fn(),
  onMoveTargetChange: vi.fn(),
  onReviewMove: vi.fn(),
  onConfirmMove: vi.fn(),
  onStartException: vi.fn(),
  onExceptionDraftChange: vi.fn(),
  onReviewException: vi.fn(),
  onConfirmException: vi.fn(),
  onStartArchive: vi.fn(),
  onArchiveDraftChange: vi.fn(),
  onConfirmArchive: vi.fn(),
  onChangeActionDetails: vi.fn(),
  onCancelAction: vi.fn(),
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

describe("order control workspace", () => {
  it("summarizes the server attention count with at most three order identities", async () => {
    const user = userEvent.setup()
    const onOpenOrders = vi.fn()
    const orders = [1, 2, 3, 4].map((index) => ({
      ...order,
      id: `order-${index}`,
      identity: {
        displayNumber: `100${index}`,
        customerDisplayName: `Customer ${index}`,
      },
      externalOrderId: `100${index}`,
    }))

    render(
      <OrderAttentionSummary
        model={{
          ...baseModel,
          counts: { needsAttention: 4, active: 14, all: 34 },
          orders,
        }}
        onOpenOrders={onOpenOrders}
      />
    )

    expect(screen.getByText("4 orders need attention")).toBeVisible()
    expect(document.querySelectorAll("[data-order-identity]")).toHaveLength(3)
    const attentionLabels = screen.getAllByText("Left behind")
    expect(attentionLabels).toHaveLength(3)
    attentionLabels.forEach((label) =>
      expect(label.parentElement).toHaveTextContent("Left behind · Today")
    )
    expect(screen.getAllByRole("button")).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Open Orders" }))
    expect(onOpenOrders).toHaveBeenCalledTimes(1)
  })

  it("does not report a clear attention state before loading settles or after an error", () => {
    const { rerender } = render(
      <OrderAttentionSummary
        model={{
          ...baseModel,
          counts: { needsAttention: 0, active: 0, all: 0 },
          orders: [],
          loading: true,
        }}
        onOpenOrders={vi.fn()}
      />
    )

    const loadingSummary = screen.getByRole("region", {
      name: "Order attention",
    })
    expect(
      within(loadingSummary).getByText("Checking order attention…")
    ).toBeVisible()
    expect(
      within(loadingSummary).queryByText("No orders need attention")
    ).not.toBeInTheDocument()
    expect(within(loadingSummary).queryByText("0")).not.toBeInTheDocument()

    rerender(
      <OrderAttentionSummary
        model={{
          ...baseModel,
          counts: { needsAttention: 0, active: 0, all: 0 },
          orders: [],
          error: "Request failed",
        }}
        onOpenOrders={vi.fn()}
      />
    )

    const errorSummary = screen.getByRole("region", {
      name: "Order attention",
    })
    expect(
      within(errorSummary).getByText("Order attention could not be refreshed.")
    ).toBeVisible()
    expect(
      within(errorSummary).queryByText("No orders need attention")
    ).not.toBeInTheDocument()
    expect(within(errorSummary).queryByText("0")).not.toBeInTheDocument()
  })

  it("exposes tab, URL-filter, row, and cursor actions through callbacks", async () => {
    const user = userEvent.setup()
    const callbacks = makeCallbacks()
    render(
      <OrderControlWorkspace
        model={baseModel}
        callbacks={callbacks}
        isMobile={false}
      />
    )

    await user.click(screen.getByRole("tab", { name: /Active/ }))
    expect(callbacks.onTabChange).toHaveBeenCalledWith("active")

    fireEvent.change(screen.getByLabelText("Search orders"), {
      target: { value: "1001" },
    })
    expect(callbacks.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ query: "1001" })
    )

    await user.selectOptions(screen.getByLabelText("Order status"), "scheduled")
    expect(callbacks.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: "scheduled" })
    )

    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(callbacks.onNextPage).toHaveBeenCalledWith("next-orders")

    await user.click(screen.getByRole("button", { name: "Order 1001" }))
    expect(callbacks.onOpenOrder).toHaveBeenCalledWith("order-1")
  })

  it("keeps settled order content in place during a background refresh", () => {
    render(
      <OrderControlWorkspace
        model={{ ...baseModel, refreshing: true }}
        callbacks={makeCallbacks()}
        isMobile={false}
      />
    )

    expect(screen.getByRole("button", { name: "Order 1001" })).toBeVisible()
    expect(screen.getByText("Updating")).toBeVisible()
    expect(screen.queryByLabelText("Loading orders")).not.toBeInTheDocument()
  })

  it("prioritizes operational truth without presenting a source controller", () => {
    render(
      <OrderControlWorkspace
        model={{ ...baseModel, selectedOrder: order }}
        callbacks={makeCallbacks()}
        isMobile={false}
      />
    )

    const sheet = document.querySelector('[data-slot="sheet-content"]')
    const scrollArea = sheet?.querySelector('[data-slot="scroll-area"]')
    const body = scrollArea?.querySelector(".flex.min-w-0.flex-col")
    expect(scrollArea).not.toHaveClass("px-5")
    expect(body).toHaveClass("px-5", "sm:px-6")
    expect(sheet?.querySelector('[data-slot="sheet-header"]')).toHaveClass(
      "px-5",
      "sm:px-6"
    )
    expect(sheet?.querySelector('[data-slot="sheet-footer"]')).toHaveClass(
      "px-5",
      "sm:px-6"
    )

    const floorPosition = screen.getByRole("heading", {
      name: "Floor position",
    })
    const orderActions = screen.getByRole("heading", {
      name: "Order actions",
    })
    const customer = screen.getByRole("heading", {
      name: "Customer and order",
    })
    expect(
      floorPosition.compareDocumentPosition(orderActions) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      orderActions.compareDocumentPosition(customer) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.queryByText("Source & audit")).toBeNull()
    expect(screen.queryByText(/IN_PROGRESS/)).toBeNull()
  })

  it("renders a mobile guided leave-behind review and exact confirmation", async () => {
    const user = userEvent.setup()
    const callbacks = makeCallbacks()
    const action = {
      kind: "leave_behind" as const,
      draft: {
        reason: "missed_load",
        restartStage: "washing",
        targetBatchId: "",
        note: "Keep on blue cart",
      },
      reasonOptions: [{ value: "missed_load", label: "Missed machine load" }],
      restartStageOptions: [{ value: "washing", label: "Washing" }],
      targetOptions: [
        {
          batchId: "batch-3",
          label: "Batch 3",
          detail: "170 / 224 lb",
          disabled: false,
          disabledReason: null,
        },
      ],
      preview: null,
      busy: false,
      error: null,
    }
    const { rerender } = render(
      <OrderControlWorkspace
        model={{ ...baseModel, selectedOrder: order, detailAction: action }}
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
    expect(
      screen.getByText(
        "Choose physical truth, not the stage LPMS currently expects."
      )
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Review floor change" })
    )
    expect(callbacks.onReviewException).toHaveBeenCalled()

    rerender(
      <OrderControlWorkspace
        model={{
          ...baseModel,
          selectedOrder: order,
          detailAction: {
            ...action,
            preview: {
              title: "Compatible later batch found",
              destinationLabel: "Batch 3",
              destinationDetail: "Washing has not started",
              effects: ["Batch 2 continues without this order"],
              warnings: [],
              confirmationLabel: "Confirm leave behind",
            },
          },
        }}
        callbacks={callbacks}
        isMobile
      />
    )
    await user.click(
      screen.getByRole("button", { name: "Confirm leave behind" })
    )
    expect(callbacks.onConfirmException).toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(callbacks.onCloseOrder).toHaveBeenCalled()
  })

  it("keeps mobile order tabs compact without changing their accessible names", () => {
    render(
      <OrderControlWorkspace
        model={baseModel}
        callbacks={makeCallbacks()}
        isMobile
      />
    )

    const attentionTab = screen.getByRole("tab", {
      name: "Needs attention, 1",
    })
    expect(attentionTab).toHaveClass("min-w-0")
    expect(attentionTab.querySelector(".sm\\:hidden")).toHaveTextContent(
      "Attention"
    )
    expect(screen.getAllByText("Ada Rivera")).not.toHaveLength(0)
  })
})

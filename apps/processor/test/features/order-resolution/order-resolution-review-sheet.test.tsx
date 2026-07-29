import { useState } from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProductionOrderBacklogCursor } from "@pressly/contracts"
import {
  type OrderResolutionReviewCallbacks,
  type OrderResolutionReviewCopy,
  type OrderResolutionReviewModel,
  type OrderResolutionReviewScope,
} from "@/features/order-resolution/order-resolution-review.model"
import { OrderResolutionReviewSheet } from "@/features/order-resolution/order-resolution-review-sheet.view"
import {
  emptyReviewPreview,
  reviewCopy,
  reviewPreview,
  reviewResult,
  reviewScope,
  spanishReviewCopy,
} from "./order-resolution-review.fixture"

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  })
})

const useMobileViewport = () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

type CallbackSpies = OrderResolutionReviewCallbacks

const makeSpies = (): CallbackSpies => ({
  onOpenChange: vi.fn<OrderResolutionReviewCallbacks["onOpenChange"]>(),
  onScopeChange: vi.fn<OrderResolutionReviewCallbacks["onScopeChange"]>(),
  onPreview: vi.fn<OrderResolutionReviewCallbacks["onPreview"]>(),
  onPreviewNext: vi.fn<OrderResolutionReviewCallbacks["onPreviewNext"]>(),
  onCommit: vi.fn<OrderResolutionReviewCallbacks["onCommit"]>(),
  onResolveIndividually:
    vi.fn<OrderResolutionReviewCallbacks["onResolveIndividually"]>(),
  onOpenHistory: vi.fn<OrderResolutionReviewCallbacks["onOpenHistory"]>(),
  onReviewAnother: vi.fn<OrderResolutionReviewCallbacks["onReviewAnother"]>(),
})

function ReviewHarness({
  initialOpen,
  initialScope,
  canManage,
  model,
  copy,
  spies,
}: Readonly<{
  initialOpen: boolean
  initialScope: OrderResolutionReviewScope
  canManage: boolean
  model: OrderResolutionReviewModel
  copy: OrderResolutionReviewCopy
  spies: CallbackSpies
}>) {
  const [open, setOpen] = useState(initialOpen)
  const [scope, setScope] = useState(initialScope)
  const callbacks: OrderResolutionReviewCallbacks = {
    onOpenChange: (nextOpen) => {
      spies.onOpenChange(nextOpen)
      setOpen(nextOpen)
    },
    onScopeChange: (nextScope) => {
      spies.onScopeChange(nextScope)
      setScope(nextScope)
    },
    onPreview: spies.onPreview,
    onPreviewNext: spies.onPreviewNext,
    onCommit: spies.onCommit,
    onResolveIndividually: spies.onResolveIndividually,
    onOpenHistory: spies.onOpenHistory,
    onReviewAnother: spies.onReviewAnother,
  }

  return (
    <OrderResolutionReviewSheet
      canManage={canManage}
      open={open}
      locale={copy === spanishReviewCopy ? "es" : "en-US"}
      timezone="America/New_York"
      scope={scope}
      model={model}
      copy={copy}
      callbacks={callbacks}
    />
  )
}

const renderReview = ({
  initialOpen = true,
  initialScope = reviewScope,
  canManage = true,
  model = {
    status: "preview",
    preview: reviewPreview,
    individual: { status: "idle" },
  } satisfies OrderResolutionReviewModel,
  copy = reviewCopy,
}: Partial<{
  initialOpen: boolean
  initialScope: OrderResolutionReviewScope
  canManage: boolean
  model: OrderResolutionReviewModel
  copy: OrderResolutionReviewCopy
}> = {}) => {
  const spies = makeSpies()
  const result = render(
    <ReviewHarness
      initialOpen={initialOpen}
      initialScope={initialScope}
      canManage={canManage}
      model={model}
      copy={copy}
      spies={spies}
    />
  )
  return { ...result, spies }
}

describe("order resolution review sheet", () => {
  it("renders the exact server-owned groups without a delete action", async () => {
    const user = userEvent.setup()
    const { container } = renderReview()

    const sheet = screen.getByRole("dialog", { name: "Review old orders" })
    expect(sheet).toHaveAccessibleDescription(
      "Clear old work from the active Processor workspace."
    )
    expect(sheet).toHaveAttribute("data-size", "workspace")
    expect(sheet).toHaveClass("overflow-x-hidden")
    expect(
      screen.getByText(
        "These records are kept. Nothing is deleted or marked as produced."
      )
    ).toBeVisible()
    expect(screen.getByText("4 candidates in this preview")).toBeVisible()
    expect(screen.getByText("Ready to archive")).toBeVisible()
    expect(screen.getByText("Review individually")).toBeVisible()
    expect(screen.getByText("Kept for safety")).toBeVisible()
    expect(screen.getByText("Already in history")).toBeVisible()
    expect(screen.getByText("Order C-1001")).toBeVisible()
    expect(screen.getByText("Order C-1002")).toBeVisible()
    expect(screen.getAllByRole("combobox")).toHaveLength(1)

    await user.click(screen.getByText("Kept for safety"))
    expect(screen.getByText("Order C-1003")).toBeVisible()
    await user.click(screen.getByText("Already in history"))
    expect(screen.getByText("Order C-1004")).toBeVisible()

    expect(screen.queryByRole("button", { name: /^delete/i })).toBeNull()
    expect(container.querySelector("[data-icon='trash']")).toBeNull()
    expect(container.querySelector('input[type="date"]')).toBeNull()
  })

  it("binds bulk confirmation to the exact preview hash and scope", async () => {
    const user = userEvent.setup()
    const { spies } = renderReview()

    await user.click(
      screen.getByRole("button", { name: "Archive 1 ready order" })
    )
    const confirmation = screen.getByRole("alertdialog", {
      name: "Archive 1 order from active work?",
    })
    expect(confirmation).toHaveTextContent(
      "Only the exact Ready to archive candidates in this preview will change."
    )
    expect(confirmation).toHaveTextContent(
      "Records are kept and no order is marked produced."
    )

    await user.click(
      within(confirmation).getByRole("button", {
        name: "Archive from active work",
      })
    )
    expect(spies.onCommit).toHaveBeenCalledWith({
      filter: reviewScope.filter,
      cutoff: reviewScope.cutoff,
      reason: reviewScope.reason,
      cursor: null,
      maxOrders: reviewScope.maxOrders,
      note: reviewScope.note,
      previewHash: reviewPreview.previewHash,
    })
  })

  it("can review the next server page without requiring a ready-to-archive item", async () => {
    const user = userEvent.setup()
    const nextCursor =
      "eyJ2IjoxLCJwYWdlIjoyLCJvcmRlciI6IjEwMDIifQ" as ProductionOrderBacklogCursor
    const zeroReadyPage = {
      ...reviewPreview,
      candidateCount: 3,
      hasMore: true,
      nextCursor,
      groups: {
        ...reviewPreview.groups,
        readyToArchive: [],
      },
    }
    const first = renderReview({
      model: {
        status: "preview",
        preview: zeroReadyPage,
        individual: { status: "idle" },
      },
    })

    expect(
      screen.queryByRole("button", { name: /Archive \d+ ready/ })
    ).toBeNull()
    await user.click(screen.getByRole("button", { name: "Review next page" }))
    expect(first.spies.onPreviewNext).toHaveBeenCalledWith(nextCursor)
    first.unmount()

    renderReview({
      model: {
        status: "committing",
        preview: zeroReadyPage,
      },
    })
    expect(
      screen.getByRole("button", { name: "Review next page" })
    ).toBeDisabled()
  })

  it("uses the controlled shadcn Calendar and invalidates the old cutoff boundary", async () => {
    const user = userEvent.setup()
    const { spies, container } = renderReview()

    expect(container.querySelector('input[type="date"]')).toBeNull()
    await user.click(screen.getByRole("button", { name: /^Due before:/i }))
    await user.click(
      screen.getByRole("button", {
        name: /tuesday, june 30th, 2026/i,
      })
    )

    expect(spies.onScopeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cutoff: "",
        cutoffDate: expect.any(Date),
      })
    )
  })

  it("requires stronger confirmation before resolving an individual review item", async () => {
    const user = userEvent.setup()
    const { spies } = renderReview()

    await user.click(
      screen.getByRole("button", { name: "Review Order C-1002" })
    )
    const confirmation = screen.getByRole("alertdialog", {
      name: "Archive Order C-1002?",
    })
    const action = within(confirmation).getByRole("button", {
      name: "Archive from active work",
    })
    expect(action).toBeDisabled()
    expect(confirmation).toHaveTextContent("Physical intake recorded")

    await user.click(
      within(confirmation).getByLabelText(
        "I reviewed the listed Pressly facts and confirm this order was not produced here."
      )
    )
    expect(action).toBeEnabled()
    await user.click(action)

    expect(spies.onResolveIndividually).toHaveBeenCalledWith({
      item: reviewPreview.groups.reviewIndividually[0],
      command: {
        action: "resolve_without_production",
        reason: "processor_not_in_use",
        note: reviewScope.note,
        confirmReviewedFacts: true,
      },
    })
  })

  it("keeps a stale preview visible but disables it until refresh", async () => {
    const user = userEvent.setup()
    const { spies } = renderReview({
      model: {
        status: "drift",
        preview: reviewPreview,
        message: "An order changed after this preview was prepared.",
      },
    })

    expect(
      screen.getByText("The order list changed").closest('[role="alert"]')
    ).toHaveTextContent("An order changed after this preview was prepared.")
    expect(
      screen.getByRole("button", { name: "Review Order C-1002" })
    ).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Refresh preview" }))
    expect(spies.onPreview).toHaveBeenCalledWith({
      filter: reviewScope.filter,
      cutoff: reviewScope.cutoff,
      reason: reviewScope.reason,
      cursor: null,
      maxOrders: reviewScope.maxOrders,
    })
  })

  it("shows loading, empty, and partial-error states without replacing settled content", () => {
    const loading = renderReview({ model: { status: "loading" } })
    expect(screen.getByLabelText("Loading old-order preview")).toHaveAttribute(
      "aria-busy",
      "true"
    )
    loading.unmount()

    const empty = renderReview({
      model: {
        status: "preview",
        preview: emptyReviewPreview,
        individual: { status: "idle" },
      },
    })
    expect(screen.getByText("No old orders need review")).toBeVisible()
    empty.unmount()

    renderReview({
      model: {
        status: "error",
        preview: reviewPreview,
        message: "The connection stopped before confirmation.",
      },
    })
    expect(
      screen.getByText("The connection stopped before confirmation.")
    ).toBeVisible()
    expect(screen.getByText("Order C-1001")).toBeVisible()
  })

  it("distinguishes an idempotent replay from a new successful commit", async () => {
    const user = userEvent.setup()
    const { spies } = renderReview({
      model: {
        status: "success",
        result: { ...reviewResult, replayed: true },
      },
    })

    expect(screen.getByText("This review is complete")).toBeVisible()
    expect(screen.getByText("Already completed")).toBeVisible()
    expect(
      screen.getByText(
        "Pressly returned the original audited result without applying it twice."
      )
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Open History" }))
    expect(spies.onOpenHistory).toHaveBeenCalledWith()
    expect(
      screen.getByRole("button", { name: "Review another cutoff" })
    ).toBeVisible()
  })

  it("makes the continuation explicit when another exact page exists", () => {
    renderReview({
      model: {
        status: "success",
        result: {
          ...reviewResult,
          nextCursor:
            "eyJ2IjoxLCJkdWVBdCI6IjIwMjYtMDYtMDEifQ" as ProductionOrderBacklogCursor,
        },
      },
    })

    expect(screen.getByText("This page is complete")).toBeVisible()
    expect(
      screen.getByText(
        "1 order was archived from this page. More matching orders are ready to review."
      )
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Review next page" })
    ).toBeVisible()
  })

  it("keeps the manager entry private and restores focus after closing", async () => {
    const hidden = renderReview({ canManage: false, initialOpen: false })
    expect(
      screen.queryByRole("button", { name: "Review old orders" })
    ).toBeNull()
    hidden.unmount()

    const user = userEvent.setup()
    renderReview({ initialOpen: false })
    const trigger = screen.getByRole("button", { name: "Review old orders" })
    await user.click(trigger)
    expect(
      screen.getByRole("dialog", { name: "Review old orders" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("uses the localized copy contract without feature-owned English fallbacks", () => {
    renderReview({ copy: spanishReviewCopy })

    expect(
      screen.getByRole("dialog", { name: "Revisar pedidos antiguos" })
    ).toHaveAccessibleDescription(
      "Quita trabajo antiguo del espacio operativo de Processor."
    )
    expect(
      screen.getByText(
        "Los registros se conservan. Nada se elimina ni se marca como producido."
      )
    ).toBeVisible()
  })

  it("reflows to a bottom workspace sheet on a mobile viewport", () => {
    useMobileViewport()
    const { container } = renderReview()

    const sheet = screen.getByRole("dialog", { name: "Review old orders" })
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet).toHaveClass(
      "data-[side=bottom]:h-[calc(100dvh-0.5rem)]",
      "data-[side=bottom]:w-full",
      "overflow-x-hidden"
    )
    expect(container.querySelector('input[type="date"]')).toBeNull()
    expect(
      screen.getByRole("button", { name: "Archive 1 ready order" })
    ).toHaveClass("h-11")
  })
})

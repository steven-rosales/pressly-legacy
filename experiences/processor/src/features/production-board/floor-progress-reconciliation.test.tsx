import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FloorProgressReconciliationSheet } from "./floor-progress-reconciliation.view"
import {
  testBoard,
  testWorkspace,
} from "../../../test/fixtures/production.fixture"

const renderSheet = (
  overrides: Partial<
    React.ComponentProps<typeof FloorProgressReconciliationSheet>
  > = {}
) => {
  const onSubmit = vi.fn()
  render(
    <FloorProgressReconciliationSheet
      open
      isMobile={false}
      batches={testBoard.batches}
      machines={testWorkspace.machines}
      busy={false}
      error={null}
      confirmation={null}
      onOpenChange={vi.fn()}
      onSubmit={onSubmit}
      onConfirm={vi.fn()}
      onInvalidateConfirmation={vi.fn()}
      {...overrides}
    />
  )
  return { onSubmit }
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

describe("floor progress reconciliation sheet", () => {
  it("records one reviewed forward milestone with a reason and optional note", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderSheet()

    expect(
      screen.getByRole("heading", { name: "Record floor progress" })
    ).toBeInTheDocument()
    expect(screen.getByText("Waiting to sort")).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: "Folding & packaging" }))
    expect(
      screen.getByText(
        "This will mark Sorting completed, Washing completed, Drying completed, then Folding & packaging started."
      )
    ).toBeInTheDocument()
    await user.selectOptions(
      screen.getByLabelText("Why is the board behind?"),
      "lpms_unavailable"
    )
    await user.type(
      screen.getByLabelText("Note (optional)"),
      "Tablet lost its connection"
    )
    await user.click(screen.getByRole("button", { name: "Review progress" }))

    expect(onSubmit).toHaveBeenCalledWith({
      productionBatchId: testBoard.batches[0]!.id,
      target: "folding_packaging_started",
      reason: "lpms_unavailable",
      note: "Tablet lost its connection",
      machineIds: [],
    })
  })

  it("requires a current machine for an active washing or drying target", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderSheet()

    await user.click(screen.getByRole("radio", { name: "Washing" }))
    const washer = screen.getByRole("checkbox", { name: /Washer 1/ })
    expect(washer).toBeChecked()
    await user.click(washer)
    expect(
      screen.getByRole("button", { name: "Review progress" })
    ).toBeDisabled()
    await user.click(washer)
    await user.click(screen.getByRole("button", { name: "Review progress" }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "washing_started",
        machineIds: [testWorkspace.machines[0]!.id],
      })
    )
  })

  it("states every terminal consequence before Finished can be submitted", async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole("radio", { name: "Finished" }))
    expect(screen.getByText(/finishes 2 orders and 5 bags/)).toBeInTheDocument()
    expect(
      screen.getByText(/production run and shift will close/)
    ).toBeInTheDocument()
  })

  it("uses a bottom sheet on mobile and preserves 44px floor actions", () => {
    renderSheet({ isMobile: true })

    const sheet = document.querySelector('[data-slot="sheet-content"]')
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet).toHaveAttribute("data-size", "workspace")
    expect(sheet).toHaveClass(
      "overflow-hidden",
      "data-[side=bottom]:h-[calc(100dvh-0.5rem)]"
    )
    expect(sheet?.querySelector('[data-slot="scroll-area"]')).toHaveClass(
      "min-h-0",
      "flex-1"
    )
    expect(screen.getByRole("button", { name: "Review progress" })).toHaveClass(
      "h-11"
    )
  })
})

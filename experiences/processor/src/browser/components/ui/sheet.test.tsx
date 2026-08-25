import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./sheet"

describe("sheet", () => {
  it("gives workspace panels a bounded viewport, a 40vw desktop width, and a reachable close action", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="right" size="workspace">
          <SheetHeader>
            <SheetTitle>Order details</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">Details</div>
          <SheetFooter>Actions</SheetFooter>
        </SheetContent>
      </Sheet>
    )

    const panel = screen.getByRole("dialog", { name: "Order details" })
    expect(panel).toHaveAttribute("data-size", "workspace")
    expect(panel).toHaveClass(
      "overflow-hidden",
      "data-[side=bottom]:h-[calc(100dvh-0.5rem)]",
      "data-[side=right]:md:w-[40vw]",
      "data-[side=right]:md:max-w-[40vw]"
    )
    expect(panel.querySelector('[data-slot="sheet-header"]')).toHaveClass(
      "shrink-0"
    )
    expect(panel.querySelector('[data-slot="sheet-footer"]')).toHaveClass(
      "shrink-0"
    )

    const close = screen.getByRole("button", { name: "Close" })
    expect(close).toHaveClass("z-20", "size-11", "touch-manipulation")
    await user.click(close)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("leaves ordinary sheets on the compact default layout", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Navigation</SheetTitle>
        </SheetContent>
      </Sheet>
    )

    const panel = screen.getByRole("dialog", { name: "Navigation" })
    expect(panel).toHaveAttribute("data-size", "default")
    expect(panel).not.toHaveClass("data-[side=right]:md:w-[40vw]")
  })
})

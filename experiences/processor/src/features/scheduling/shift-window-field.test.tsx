import { useState } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScheduleSettingsSheet } from "./schedule-settings-sheet.view"
import { ShiftWindowField } from "./shift-window-field.view"
import { renderWithProcessorBrowserCapabilities as render } from "../../../test/support/browser-capabilities.fixture.tsx"

const originalMatchMedia = window.matchMedia

afterEach(() => {
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

function ShiftWindowHarness({
  initialStart = "2026-07-13T16:30",
  initialEnd = "2026-07-13T22:30",
}: Readonly<{ initialStart?: string; initialEnd?: string }>) {
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)

  return (
    <>
      <ShiftWindowField
        start={start}
        end={end}
        timezone="America/New_York"
        onStartChange={setStart}
        onEndChange={setEnd}
      />
      <output aria-label="start value">{start}</output>
      <output aria-label="end value">{end}</output>
    </>
  )
}

describe("shift window field", () => {
  it("summarizes the local window without native datetime inputs", () => {
    const { container } = render(<ShiftWindowHarness />)

    expect(
      screen.getByRole("button", {
        name: /shift window: july 13, 2026, 4:30 pm to 10:30 pm/i,
      })
    ).toBeInTheDocument()
    expect(screen.getByText("Same-day shift · America/New_York")).toBeVisible()
    const trigger = screen.getByLabelText(/^shift window:/i)
    const descriptionId = trigger.getAttribute("aria-describedby")
    expect(descriptionId).not.toBeNull()
    expect(document.getElementById(descriptionId!)).toHaveTextContent(
      "Same-day shift · America/New_York"
    )
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull()
  })

  it("moves both local values when the working date changes", async () => {
    const user = userEvent.setup()
    render(<ShiftWindowHarness />)

    await user.click(screen.getByLabelText(/^shift window:/i))
    await user.click(
      screen.getByRole("button", { name: /wednesday, july 15th, 2026/i })
    )

    expect(screen.getByLabelText("start value")).toHaveTextContent(
      "2026-07-15T16:30"
    )
    expect(screen.getByLabelText("end value")).toHaveTextContent(
      "2026-07-15T22:30"
    )
  })

  it("makes an earlier end time explicitly overnight", async () => {
    const user = userEvent.setup()
    render(<ShiftWindowHarness />)

    await user.click(screen.getByLabelText(/^shift window:/i))
    await user.click(screen.getByRole("combobox", { name: "End time" }))
    await user.click(screen.getByRole("option", { name: "6:00 AM" }))

    expect(screen.getByLabelText("end value")).toHaveTextContent(
      "2026-07-14T06:00"
    )
    expect(screen.getByText("Next day")).toBeVisible()
    expect(screen.getByText("Overnight shift · America/New_York")).toBeVisible()
  })

  it("rejects equal clock times instead of silently creating a 24-hour shift", async () => {
    const user = userEvent.setup()
    render(<ShiftWindowHarness />)

    await user.click(screen.getByLabelText(/^shift window:/i))
    await user.click(screen.getByRole("combobox", { name: "End time" }))
    await user.click(screen.getByRole("option", { name: "4:30 PM" }))

    expect(screen.getByLabelText("end value")).toHaveTextContent(
      "2026-07-13T16:30"
    )
    expect(
      screen.getByText(
        "Start and end time must be different; equal times would create a 24-hour shift."
      )
    ).toBeVisible()
    const trigger = screen.getByLabelText(/^shift window:/i)
    expect(trigger).toHaveAttribute("aria-invalid", "true")
    const describedBy =
      trigger.getAttribute("aria-describedby")?.split(" ") ?? []
    expect(describedBy).toHaveLength(2)
    expect(document.getElementById(describedBy[1]!)).toHaveAttribute(
      "role",
      "alert"
    )
  })

  it("returns an overnight window to the working date when the end moves later", async () => {
    const user = userEvent.setup()
    render(
      <ShiftWindowHarness
        initialStart="2026-07-13T20:00"
        initialEnd="2026-07-14T06:00"
      />
    )

    await user.click(screen.getByLabelText(/^shift window:/i))
    await user.click(screen.getByRole("combobox", { name: "End time" }))
    await user.click(screen.getByRole("option", { name: "10:00 PM" }))

    expect(screen.getByLabelText("end value")).toHaveTextContent(
      "2026-07-13T22:00"
    )
    expect(screen.queryByText("Next day")).not.toBeInTheDocument()
  })

  it("preserves off-grid minute values as selectable options", async () => {
    const user = userEvent.setup()
    render(
      <ShiftWindowHarness
        initialStart="2026-07-13T16:07"
        initialEnd="2026-07-13T22:23"
      />
    )

    await user.click(screen.getByLabelText(/^shift window:/i))
    expect(
      screen.getByRole("combobox", { name: "Start time" })
    ).toHaveTextContent("4:07 PM")
    expect(
      screen.getByRole("combobox", { name: "End time" })
    ).toHaveTextContent("10:23 PM")
  })

  it("uses a shorter half-hour option set with floor-sized choices", async () => {
    const user = userEvent.setup()
    render(<ShiftWindowHarness />)

    await user.click(screen.getByLabelText(/^shift window:/i))
    await user.click(screen.getByRole("combobox", { name: "Start time" }))

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(48)
    expect(options.every((option) => option.classList.contains("h-11"))).toBe(
      true
    )
  })

  it("uses a bottom sheet and compact calendar geometry on a 320px-class viewport", async () => {
    useMobileViewport()
    const user = userEvent.setup()
    const onApply = vi.fn(async () => true)
    render(
      <ScheduleSettingsSheet
        mode="edit"
        pulseMinutes={50}
        foldRate={2}
        configVersion={3}
        timezone="America/New_York"
        settings={{
          folders: 2,
          shiftStartsAt: "2026-07-13T16:30",
          shiftEndsAt: "2026-07-13T22:30",
        }}
        disabled={false}
        error={null}
        onApply={onApply}
      />
    )

    await user.click(screen.getByRole("button", { name: "Edit shift" }))
    const sheet = screen.getByRole("dialog", { name: "Shift settings" })
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet).toHaveAttribute("data-size", "workspace")
    expect(sheet).toHaveClass(
      "data-[side=bottom]:h-[calc(100dvh-0.5rem)]",
      "data-[side=bottom]:max-h-[calc(100dvh-0.5rem)]",
      "data-[side=bottom]:w-full"
    )

    const folders = screen.getByLabelText("Folding team")
    const foldersDescriptionId = folders.getAttribute("aria-describedby")
    expect(document.getElementById(foldersDescriptionId!)).toHaveTextContent(
      "Effective people available for folding and packaging."
    )

    await user.click(screen.getByLabelText(/^shift window:/i))
    const popover = screen.getByLabelText("Choose shift date and times")
    expect(popover).toHaveClass(
      "w-[calc(100vw-1rem)]",
      "max-w-[22rem]",
      "max-h-[var(--radix-popover-content-available-height)]",
      "overflow-y-auto",
      "overscroll-contain",
      "p-3"
    )
    const calendar = popover.querySelector("[data-slot=calendar]")
    expect(calendar).toHaveClass("p-0", "[--cell-size:--spacing(10)]")
    expect(calendar?.querySelector("[class~='gap-2']")).not.toBeNull()
    expect(calendar?.querySelectorAll("tbody tr")).toHaveLength(5)
    expect(
      screen.queryByRole("button", { name: /sunday, august 2nd, 2026/i })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "End time" }))
    await user.click(screen.getByRole("option", { name: "4:30 PM" }))
    expect(
      screen.getByRole("button", { name: "Save & recompute" })
    ).toBeDisabled()
    expect(onApply).not.toHaveBeenCalled()
  })

  it("disables the whole control when scheduling is unavailable", () => {
    render(
      <ShiftWindowField
        start="2026-07-13T16:30"
        end="2026-07-13T22:30"
        timezone="America/New_York"
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        disabled
      />
    )

    expect(screen.getByLabelText(/^shift window:/i)).toBeDisabled()
  })
})

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { processorLanguageStorageKey } from "../../browser/localization/index.ts"
import { SettingsView } from "./settings.view"
import { renderWithProcessorBrowserCapabilities as render } from "../../../test/support/browser-capabilities.fixture.tsx"
import {
  makeTestProductionPort,
  testConfig,
  testIdempotency,
  testLocation,
  testShift,
} from "../../../test/fixtures/production.fixture"

const baseProps = {
  theme: "light" as const,
  onThemeChange: vi.fn(),
  production: makeTestProductionPort(),
  idempotency: testIdempotency,
  locationId: testLocation.id,
  canManage: true,
  onConfigurationPublished: vi.fn(async () => undefined),
}

describe("settings view", () => {
  it("switches Processor between English and Spanish and persists the choice", async () => {
    const user = userEvent.setup()
    render(
      <SettingsView
        {...baseProps}
        schedulerConfig={testConfig}
        shift={testShift}
      />
    )

    await user.click(screen.getByRole("radio", { name: "Español" }))

    expect(
      screen.getByRole("heading", { name: "Pulso de producción publicado" })
    ).toBeInTheDocument()
    expect(document.documentElement.lang).toBe("es")
    expect(window.localStorage.getItem(processorLanguageStorageKey)).toBe("es")

    await user.click(screen.getByRole("radio", { name: "English" }))

    expect(
      screen.getByRole("heading", { name: "Published production pulse" })
    ).toBeInTheDocument()
    expect(document.documentElement.lang).toBe("en")
  })

  it("presents the published pulse as a compact operational summary", () => {
    const { container } = render(
      <SettingsView
        {...baseProps}
        schedulerConfig={testConfig}
        shift={testShift}
      />
    )

    expect(
      screen.getByRole("heading", { name: "Published production pulse" })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Immutable scheduler configuration · version 3")
    ).toBeInTheDocument()
    expect(screen.getByText("50 minutes")).toBeInTheDocument()
    expect(screen.getByText("2 lb/min/person")).toBeInTheDocument()
    expect(screen.getByText("2 employees")).toBeInTheDocument()
    expect(screen.getByText("200 lb folding ceiling")).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="separator"]')).toHaveLength(
      3
    )
    expect(screen.queryByText("Physical stage fit")).not.toBeInTheDocument()
    expect(screen.queryByText("Architecture boundary")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Processor configuration" })
    ).not.toBeInTheDocument()
  })

  it("makes missing configuration the first clear task without squeezing its action", () => {
    render(<SettingsView {...baseProps} schedulerConfig={null} shift={null} />)

    expect(
      screen.getByText(
        "Production scheduling is not configured. Publish a tested pulse before computing a schedule."
      )
    ).toBeInTheDocument()
    expect(screen.getAllByText("Not published")).toHaveLength(2)
    expect(screen.getByText("No active shift")).toBeInTheDocument()
    expect(screen.queryByText("Physical stage fit")).not.toBeInTheDocument()

    const publish = screen.getByRole("button", {
      name: "Publish configuration",
    })
    expect(publish).toBeEnabled()
    expect(publish).toHaveClass("min-h-11", "w-full", "sm:w-auto")
  })
})

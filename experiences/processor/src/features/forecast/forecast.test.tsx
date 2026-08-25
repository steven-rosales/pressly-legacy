import { screen, waitFor, within } from "@testing-library/react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { processorForecastFeature } from "./feature"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { unexpectedError } from "@pressly/errors/factories"
import { ForecastWorkspaceContainer } from "./forecast-workspace.view"
import {
  makeTestProductionPort,
  testRemainingDayForecast,
} from "../../../test/fixtures/production.fixture"
import { renderWithProcessorBrowserCapabilities as render } from "../../../test/support/browser-capabilities.fixture.tsx"

const baseProps = {
  production: makeTestProductionPort(),
  locationId: testRemainingDayForecast.locationId,
  timezone: testRemainingDayForecast.timezone,
  revision: testRemainingDayForecast.asOf,
  now: () => new Date("2026-08-01T14:00:00.000Z"),
  onNavigate: vi.fn(),
  onOpenForecast: vi.fn(),
} as const

describe("remaining-day forecast workspace", () => {
  proveExperienceFeature({
    featureId: "processor.forecast",
    feature: processorForecastFeature,
    scenarios: [
      {
        name: "uses the shadcn calendar and preserves the service-day request boundary",
        proves: ["presentation-state", "component-interaction"],
        run: async () => {
          const user = userEvent.setup()
          const loadRemainingDayForecast = vi.fn(async () =>
            structuredClone(testRemainingDayForecast)
          )
          const { container } = render(
            <ForecastWorkspaceContainer
              {...baseProps}
              production={makeTestProductionPort({ loadRemainingDayForecast })}
              variant="full"
            />
          )

          expect(
            await screen.findByRole("heading", {
              name: "Remaining day",
              level: 2,
            })
          ).toBeVisible()
          expect(container.querySelector('input[type="date"]')).toBeNull()

          const serviceDay = screen.getByRole("button", {
            name: "Service day: Aug 1, 2026",
          })
          await user.click(serviceDay)
          const calendar = document.querySelector("[data-slot=calendar]")
          expect(calendar).not.toBeNull()
          const nextDay = calendar?.querySelector<HTMLButtonElement>(
            '[data-day="8/2/2026"]'
          )
          expect(nextDay).not.toBeNull()
          await user.click(nextDay!)

          await waitFor(() =>
            expect(loadRemainingDayForecast).toHaveBeenLastCalledWith(
              expect.objectContaining({ serviceDay: "2026-08-02" })
            )
          )
          expect(document.querySelector("[data-slot=calendar]")).toBeNull()
          expect(serviceDay).toHaveAccessibleName("Service day: Aug 2, 2026")
        },
      },
    ],
  })

  it("renders the four server groups, actual capacity, shifts, and destination actions", async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <ForecastWorkspaceContainer
        {...baseProps}
        variant="full"
        onNavigate={onNavigate}
      />
    )

    expect(
      await screen.findByRole("heading", { name: "Remaining day", level: 2 })
    ).toBeVisible()
    expect(
      await screen.findByRole("heading", {
        name: "In production",
        level: 3,
      })
    ).toBeVisible()
    for (const title of [
      "In production",
      "Ready to place",
      "Expected later",
      "Needs another shift",
    ])
      expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    for (const heading of [
      "In production",
      "Ready to place",
      "Expected later",
      "Needs another shift",
      "Capacity",
      "Shifts in this service day",
    ])
      expect(
        screen.getByRole("heading", { name: heading, level: 3 })
      ).toBeVisible()

    expect(screen.getByText("200 lb per production pulse")).toBeVisible()
    expect(screen.getByText("Open")).toBeVisible()
    expect(screen.getByText("Order C-2001")).toBeVisible()
    expect(screen.getByText("Northwind Hotel")).toBeVisible()
    expect(screen.getByText("Camila Reed")).toBeVisible()
    expect(screen.getByText("Customer unavailable")).toBeVisible()
    expect(
      screen.getByText(
        "A very long commercial customer name that must remain fully available to assistive technology"
      )
    ).toHaveAttribute(
      "title",
      "A very long commercial customer name that must remain fully available to assistive technology"
    )
    expect(
      screen.queryByText(
        testRemainingDayForecast.groups.inProduction[0]!.activeRunId
      )
    ).toBeNull()

    await user.click(
      screen.getAllByRole("button", { name: "Open Production" })[0]!
    )
    expect(onNavigate).toHaveBeenCalledWith({
      view: "production",
      runId: testRemainingDayForecast.groups.inProduction[0]!.activeRunId,
    })
    await user.click(screen.getByRole("button", { name: "Open Intake" }))
    expect(onNavigate).toHaveBeenCalledWith({ view: "intake" })
    await user.click(screen.getByRole("button", { name: "Open Schedule" }))
    expect(onNavigate).toHaveBeenCalledWith({ view: "schedule" })

    await user.click(
      screen.getByRole("button", { name: "How this outlook works" })
    )
    expect(
      screen.getByText("Placement is rechecked when you act.")
    ).toBeVisible()
    expect(screen.getByText("No precise finish time is shown.")).toBeVisible()
  })

  it("shows truthful empty groups without synthesizing work", async () => {
    const empty = structuredClone(testRemainingDayForecast)
    empty.totals = {
      all: {
        orderCount: 0,
        knownWeightLbs: 0,
        missingEstimateOrderCount: 0,
      },
      inProduction: {
        orderCount: 0,
        knownWeightLbs: 0,
        missingEstimateOrderCount: 0,
      },
      readyToPlace: {
        orderCount: 0,
        knownWeightLbs: 0,
        missingEstimateOrderCount: 0,
      },
      expectedLater: {
        orderCount: 0,
        knownWeightLbs: 0,
        missingEstimateOrderCount: 0,
      },
      needsShift: {
        orderCount: 0,
        knownWeightLbs: 0,
        missingEstimateOrderCount: 0,
      },
    }
    empty.groups = {
      inProduction: [],
      readyToPlace: [],
      expectedLater: [],
      needsShift: [],
    }
    render(
      <ForecastWorkspaceContainer
        {...baseProps}
        production={makeTestProductionPort({
          loadRemainingDayForecast: async () => empty,
        })}
        variant="full"
      />
    )

    expect(
      await screen.findByText(
        "No remaining orders are currently in production."
      )
    ).toBeVisible()
    expect(
      screen.getByText("No remaining orders are ready to place.")
    ).toBeVisible()
    expect(
      screen.getByText("No additional orders are expected later.")
    ).toBeVisible()
    expect(
      screen.getByText("No remaining orders currently need another shift.")
    ).toBeVisible()
  })

  it.each([
    ["home" as const, "forecast-summary-home"],
    ["schedule" as const, "forecast-summary-schedule"],
  ])(
    "keeps the %s summary compact and links to Forecast",
    async (variant, testId) => {
      const user = userEvent.setup()
      const onOpenForecast = vi.fn()
      render(
        <ForecastWorkspaceContainer
          {...baseProps}
          variant={variant}
          onOpenForecast={onOpenForecast}
        />
      )

      const summary = await screen.findByTestId(testId)
      expect(within(summary).getByText("Remaining today")).toBeVisible()
      expect(within(summary).queryByText("Order C-2001")).toBeNull()
      if (variant === "home") {
        expect(
          within(summary).getByText(
            "4 orders · 260 lb known · 1 order without an estimate"
          )
        ).toBeVisible()
        expect(
          within(summary).getByText("Expected later").nextElementSibling
        ).toHaveTextContent(
          String(testRemainingDayForecast.totals.expectedLater.orderCount)
        )
      }
      await user.click(
        within(summary).getByRole("button", { name: "Open Forecast" })
      )
      expect(onOpenForecast).toHaveBeenCalledOnce()
    }
  )

  it("shows a local error without blocking the surrounding workspace", async () => {
    render(
      <div>
        <h2>Core workspace</h2>
        <ForecastWorkspaceContainer
          {...baseProps}
          production={makeTestProductionPort({
            loadRemainingDayForecast: async () => {
              throw unexpectedError({
                code: "processor_test_forecast_offline",
                message: "offline",
              })
            },
          })}
          variant="home"
        />
      </div>
    )

    expect(screen.getByText("Core workspace")).toBeVisible()
    expect(
      await screen.findByText("Remaining-day outlook is unavailable")
    ).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled()
    )
  })

  it("retains a compact confirmed summary and marks it stale when refresh fails", async () => {
    const loadRemainingDayForecast = vi
      .fn()
      .mockResolvedValueOnce(structuredClone(testRemainingDayForecast))
      .mockRejectedValueOnce(
        unexpectedError({
          code: "processor_test_forecast_refresh_failed",
          message: "refresh failed",
        })
      )
    const production = makeTestProductionPort({ loadRemainingDayForecast })
    const { rerender } = render(
      <ForecastWorkspaceContainer
        {...baseProps}
        production={production}
        revision="revision-1"
        variant="home"
      />
    )

    expect(await screen.findByText("Remaining today")).toBeVisible()
    rerender(
      <ForecastWorkspaceContainer
        {...baseProps}
        production={production}
        revision="revision-2"
        variant="home"
      />
    )

    expect(
      await screen.findByText(
        /Could not refresh\. Showing the outlook updated/i
      )
    ).toBeVisible()
    expect(
      screen.getByText("4 orders · 260 lb known · 1 order without an estimate")
    ).toBeVisible()
  })
})

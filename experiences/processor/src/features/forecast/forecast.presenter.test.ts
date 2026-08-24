import { describe, expect, it } from "vitest"
import {
  forecastItemStateKey,
  forecastNavigationTarget,
  serviceDayAt,
} from "./forecast.presenter"
import { testRemainingDayForecast } from "../../../test/fixtures/production.fixture"

describe("remaining-day forecast presentation", () => {
  it("derives the service day in the production location timezone", () => {
    const instant = new Date("2026-08-01T00:30:00.000Z")

    expect(serviceDayAt(instant, "America/Chicago")).toBe("2026-07-31")
    expect(serviceDayAt(instant, "Asia/Tokyo")).toBe("2026-08-01")
  })

  it("maps only server-provided actions to destination navigation", () => {
    const { inProduction, readyToPlace, expectedLater, needsShift } =
      testRemainingDayForecast.groups

    expect(forecastNavigationTarget(inProduction[0]!)).toEqual({
      view: "production",
      runId: inProduction[0]!.activeRunId,
    })
    expect(forecastNavigationTarget(readyToPlace[0]!)).toEqual({
      view: "production",
      runId: readyToPlace[0]!.activeRunId,
    })
    expect(forecastNavigationTarget(expectedLater[0]!)).toEqual({
      view: "intake",
    })
    expect(forecastNavigationTarget(needsShift[0]!)).toEqual({
      view: "schedule",
    })
  })

  it("suppresses a production destination when the server supplies no run identity", () => {
    const item = {
      ...testRemainingDayForecast.groups.needsShift[0]!,
      actionability: {
        action: "review_placement" as const,
        state: "available" as const,
        reason: "overtime_confirmation_required" as const,
      },
    }

    expect(forecastNavigationTarget(item)).toBeNull()
  })

  it("presents group-specific state without reclassifying items", () => {
    expect(
      forecastItemStateKey(testRemainingDayForecast.groups.inProduction[0]!)
    ).toBe("forecast.itemState.inProduction")
    expect(
      forecastItemStateKey(testRemainingDayForecast.groups.readyToPlace[0]!)
    ).toBe("forecast.itemState.readyToPlace")
    expect(
      forecastItemStateKey(testRemainingDayForecast.groups.expectedLater[0]!)
    ).toBe("forecast.itemState.awaiting_intake")
    expect(
      forecastItemStateKey(testRemainingDayForecast.groups.needsShift[0]!)
    ).toBe("forecast.itemState.no_active_run")
  })
})

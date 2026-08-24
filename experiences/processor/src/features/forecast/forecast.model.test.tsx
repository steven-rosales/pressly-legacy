import { act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { unexpectedError } from "@pressly/errors/factories"
import { useRemainingDayForecastModel } from "./forecast.model"
import {
  makeTestProductionPort,
  testRemainingDayForecast,
} from "../../../test/fixtures/production.fixture"
import { renderHookWithProcessorBrowserCapabilities as renderHook } from "../../../test/support/browser-capabilities.fixture.tsx"

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

const modelInput = {
  locationId: testRemainingDayForecast.locationId,
  timezone: testRemainingDayForecast.timezone,
  revision: testRemainingDayForecast.asOf,
  now: () => new Date("2026-08-01T14:00:00.000Z"),
} as const

describe("remaining-day forecast model", () => {
  it("loads the location-local service day and ignores an empty date value", async () => {
    const loadRemainingDayForecast = vi.fn(async () =>
      structuredClone(testRemainingDayForecast)
    )
    const production = makeTestProductionPort({ loadRemainingDayForecast })
    const { result } = renderHook(() =>
      useRemainingDayForecastModel({
        ...modelInput,
        production,
      })
    )

    await waitFor(() => expect(result.current.forecast).not.toBeNull())
    expect(loadRemainingDayForecast).toHaveBeenCalledWith(
      expect.objectContaining({ serviceDay: "2026-08-01" })
    )

    act(() => result.current.onServiceDayChange(""))
    expect(result.current.serviceDay).toBe("2026-08-01")
    expect(loadRemainingDayForecast).toHaveBeenCalledTimes(1)
  })

  it("aborts the previous request and prevents its response from winning a day race", async () => {
    const first = deferred<typeof testRemainingDayForecast>()
    const second = deferred<typeof testRemainingDayForecast>()
    const loadRemainingDayForecast = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const production = makeTestProductionPort({ loadRemainingDayForecast })
    const { result } = renderHook(() =>
      useRemainingDayForecastModel({
        ...modelInput,
        production,
      })
    )

    await waitFor(() =>
      expect(loadRemainingDayForecast).toHaveBeenCalledTimes(1)
    )
    const firstSignal = loadRemainingDayForecast.mock.calls[0]![0].signal

    act(() => result.current.onServiceDayChange("2026-08-02"))
    expect(firstSignal.aborted).toBe(true)
    await waitFor(() =>
      expect(loadRemainingDayForecast).toHaveBeenCalledTimes(2)
    )

    act(() =>
      second.resolve({
        ...structuredClone(testRemainingDayForecast),
        serviceDay: "2026-08-02",
      })
    )
    await waitFor(() =>
      expect(result.current.forecast?.serviceDay).toBe("2026-08-02")
    )

    act(() => first.resolve(structuredClone(testRemainingDayForecast)))
    expect(result.current.forecast?.serviceDay).toBe("2026-08-02")
  })

  it("retains settled content when a revision refresh fails", async () => {
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
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useRemainingDayForecastModel({
          ...modelInput,
          revision,
          production,
        }),
      { initialProps: { revision: "revision-1" } }
    )

    await waitFor(() => expect(result.current.forecast).not.toBeNull())
    rerender({ revision: "revision-2" })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.forecast).toEqual(testRemainingDayForecast)
    expect(result.current.loading).toBe(false)
    expect(result.current.refreshing).toBe(false)
  })
})

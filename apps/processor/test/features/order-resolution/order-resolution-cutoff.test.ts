import { describe, expect, it } from "vitest"
import {
  defaultOrderResolutionCutoffDate,
  orderResolutionCutoffIso,
} from "@/features/order-resolution/order-resolution-cutoff.presenter"

describe("order resolution cutoff", () => {
  it("uses the end of the selected calendar day in the location timezone", () => {
    const date = new Date(2026, 6, 4)

    expect(orderResolutionCutoffIso(date, "America/New_York")).toBe(
      "2026-07-05T03:59:59.999Z"
    )
  })

  it("keeps the location calendar date across a daylight-saving boundary", () => {
    const date = new Date(2026, 10, 1)

    expect(orderResolutionCutoffIso(date, "America/New_York")).toBe(
      "2026-11-02T04:59:59.999Z"
    )
  })

  it("defaults to thirty location-calendar days before now", () => {
    const cutoff = defaultOrderResolutionCutoffDate(
      "America/New_York",
      new Date("2026-07-27T02:00:00.000Z")
    )

    expect([
      cutoff.getFullYear(),
      cutoff.getMonth() + 1,
      cutoff.getDate(),
    ]).toEqual([2026, 6, 26])
  })

  it("fails closed when the timezone is invalid", () => {
    expect(
      orderResolutionCutoffIso(new Date(2026, 6, 4), "Not/A_Timezone")
    ).toBeNull()
  })
})

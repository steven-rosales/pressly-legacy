import { describe, expect, it } from "vitest"
import {
  formatZonedDateTimeInput,
  presentScheduleLifecycle,
  summarizeScheduleDemand,
  zonedDateTimeInputToIso,
} from "@/features/scheduling/scheduling.presenter"
import { testOrders, testSchedule } from "../../fixtures/production.fixture"

describe("location-local scheduling inputs", () => {
  it("round-trips an operator wall time through the location timezone", () => {
    const local = formatZonedDateTimeInput(
      "2026-08-01T14:00:00.000Z",
      "America/Chicago"
    )
    expect(local).toBe("2026-08-01T09:00")
    expect(zonedDateTimeInputToIso(local, "America/Chicago")).toBe(
      "2026-08-01T14:00:00.000Z"
    )
  })

  it("rejects a wall time skipped by daylight-saving transition", () => {
    expect(() =>
      zonedDateTimeInputToIso("2026-03-08T02:30", "America/Chicago")
    ).toThrow("does not exist")
  })
})

describe("scheduling presentation", () => {
  it("separates immutable proposal demand from current eligible orders", () => {
    expect(summarizeScheduleDemand(testSchedule, [])).toEqual({
      label: "Planned demand",
      derivedWeightLbs: 200,
      bagCount: 5,
      orderCount: 2,
    })
    expect(summarizeScheduleDemand(null, testOrders)).toEqual({
      label: "Ready demand",
      derivedWeightLbs: 200,
      bagCount: 5,
      orderCount: 2,
    })
  })

  it.each([
    {
      name: "configuration",
      proposal: null,
      dirty: false,
      configurationReady: false,
      state: "configuration_required",
      actionLabel: "Open configuration",
    },
    {
      name: "compute",
      proposal: null,
      dirty: false,
      configurationReady: true,
      state: "ready",
      actionLabel: "Compute schedule",
    },
    {
      name: "dirty",
      proposal: testSchedule,
      dirty: true,
      configurationReady: true,
      state: "dirty",
      actionLabel: "Recompute schedule",
    },
    {
      name: "review",
      proposal: testSchedule,
      dirty: false,
      configurationReady: true,
      state: "draft",
      actionLabel: "Accept plan",
    },
    {
      name: "start",
      proposal: { ...testSchedule, status: "accepted" as const },
      dirty: false,
      configurationReady: true,
      state: "accepted",
      actionLabel: "Start production run",
    },
  ])("presents one primary action for the $name state", (testCase) => {
    const presentation = presentScheduleLifecycle(testCase)
    expect(presentation.state).toBe(testCase.state)
    expect(presentation.actionLabel).toBe(testCase.actionLabel)
  })
})

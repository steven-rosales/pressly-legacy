import { describe, expect, it } from "vitest"
import {
  formatCountdown,
  formatStageWindow,
  presentStage,
  selectDefaultStage,
} from "./production-board.presenter"
import { testBoard } from "../../../test/fixtures/production.fixture"

describe("production board presenter", () => {
  it("uses server authorization instead of inferring readiness from time", () => {
    const stage = structuredClone(testBoard.batches[0]!.stages[0]!)
    stage.plannedStartAt = "2026-08-01T16:00:00.000Z"
    stage.nextAction = { state: "available", action: "start" }

    expect(
      presentStage({ stage, now: Date.parse("2026-08-01T14:00:00.000Z") })
    ).toEqual(
      expect.objectContaining({
        state: "ready",
        labelKey: "production.readyToStart",
        action: "start",
      })
    )
  })

  it("keeps an early start actionable while showing the planned boundary", () => {
    const stage = structuredClone(testBoard.batches[0]!.stages[0]!)
    stage.nextAction = {
      state: "confirmation_required",
      action: "start",
      code: "PLANNED_START_NOT_REACHED",
      message: "The planned stage boundary has not been reached.",
      availableAt: "2026-08-01T14:05:00.000Z",
      timing: {
        plannedStartAt: "2026-08-01T14:05:00.000Z",
        plannedEndAt: "2026-08-01T14:55:00.000Z",
        observedAt: "2026-08-01T14:00:00.000Z",
        remainingMilliseconds: 300_000,
      },
    }

    expect(
      presentStage({ stage, now: Date.parse("2026-08-01T14:00:00.000Z") })
    ).toEqual({
      state: "upcoming",
      labelKey: "production.scheduledToStart",
      detailKey: "production.startIfReady",
      action: "start",
      availableAt: Date.parse("2026-08-01T14:05:00.000Z"),
    })
  })

  it("never shows a negative countdown after a stale boundary", () => {
    expect(formatCountdown(1_000, 2_000)).toBe("Checking readiness…")
  })

  it("adds a date when a stage is outside the board's facility-local day", () => {
    expect(
      formatStageWindow(
        "2026-08-02T14:00:00.000Z",
        "2026-08-02T14:50:00.000Z",
        "2026-08-01T14:00:00.000Z",
        "America/Chicago"
      )
    ).toBe("Aug 2 · 9:00 AM–9:50 AM")
  })

  it("keeps an early completion actionable while showing the planned boundary", () => {
    const stage = structuredClone(testBoard.batches[0]!.stages[0]!)
    stage.status = "started"
    stage.actualStartAt = "2026-08-01T14:00:00.000Z"
    stage.nextAction = {
      state: "confirmation_required",
      action: "complete",
      code: "PULSE_BOUNDARY_NOT_REACHED",
      message: "The planned pulse is still running.",
      availableAt: "2026-08-01T14:50:00.000Z",
      timing: {
        actualStartAt: "2026-08-01T14:00:00.000Z",
        plannedEndAt: "2026-08-01T14:50:00.000Z",
        completionBoundaryAt: "2026-08-01T14:50:00.000Z",
        observedAt: "2026-08-01T14:10:00.000Z",
        plannedDurationMilliseconds: 3_000_000,
        elapsedMilliseconds: 600_000,
        remainingMilliseconds: 2_400_000,
      },
    }

    expect(presentStage({ stage, now: Date.parse(testBoard.asOf) })).toEqual({
      state: "in_progress",
      labelKey: "production.inProgress",
      detailKey: "production.earlyConfirmation",
      action: "complete",
      availableAt: Date.parse("2026-08-01T14:50:00.000Z"),
    })
  })

  it("opens compact tabs on active work, then server-ready work", () => {
    const active = structuredClone(testBoard.batches)
    active[0]!.stages[0]!.status = "completed"
    active[0]!.stages[0]!.nextAction = {
      state: "terminal",
      reason: "stage_completed",
    }
    active[0]!.stages[1]!.status = "started"
    active[0]!.stages[1]!.nextAction = {
      state: "confirmation_required",
      action: "complete",
      code: "PULSE_BOUNDARY_NOT_REACHED",
      message: "The pulse boundary has not been reached.",
      availableAt: "2026-08-01T15:40:00.000Z",
      timing: {
        actualStartAt: "2026-08-01T14:50:00.000Z",
        plannedEndAt: "2026-08-01T15:40:00.000Z",
        completionBoundaryAt: "2026-08-01T15:40:00.000Z",
        observedAt: "2026-08-01T15:00:00.000Z",
        plannedDurationMilliseconds: 3_000_000,
        elapsedMilliseconds: 600_000,
        remainingMilliseconds: 2_400_000,
      },
    }
    expect(selectDefaultStage(active)).toBe("washing")

    const ready = structuredClone(testBoard.batches)
    ready[0]!.stages[0]!.nextAction = {
      state: "blocked",
      action: "start",
      code: "PREVIOUS_STAGE_INCOMPLETE",
      message: "Wait for the previous stage.",
      availableAt: null,
    }
    ready[0]!.stages[2]!.nextAction = {
      state: "available",
      action: "start",
    }
    expect(selectDefaultStage(ready)).toBe("drying")
  })
})

import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"
import { englishAppMessages } from "../localization/index.ts"
import { presentAppError } from "./app.error.presenter"
import { presentAuthenticationError } from "../../features/authentication/authentication.error.presenter"
import { presentHistoryError } from "../../features/history/history.error.presenter"
import { presentIntakeError } from "../../features/intake/intake.error.presenter"
import { presentOrderControlError } from "../../features/order-control/order-control.error.presenter"
import {
  presentPlacementFailure,
  presentProductionBoardError,
} from "../../features/production-board/production-board.error.presenter"
import { presentPendingPlacementMessage } from "../../features/production-board/production-board.presenter"
import { presentSchedulingError } from "../../features/scheduling/scheduling.error.presenter"
import { presentScheduleWarning } from "../../features/scheduling/scheduling.presenter"
import { presentSettingsError } from "../../features/settings/settings.error.presenter"
import {
  requestFailure,
  type RequestFailureKind,
} from "../../capabilities/request.error"

const diagnosticId = "90ed1925-f197-46f4-8d41-3a3347544ddf"
const t = ((key: string) => key) as TFunction

const failure = (code: string, kind: RequestFailureKind = "unexpected") =>
  requestFailure({
    code,
    requestKind: kind,
    message: "Server-safe detail",
    traceId: diagnosticId,
  })

describe("Processor error presentation", () => {
  it("keeps correlation identifiers on diagnostics but out of error messages", () => {
    const cause = failure("hard_capacity_exceeded")

    expect(cause.referenceId).toBe(diagnosticId)
    expect(cause.message).toBe("Server-safe detail")
    expect(cause.message).not.toContain(diagnosticId)
  })

  it("explains the shift-time start rejection instead of reporting a generic conflict", () => {
    expect(
      presentSchedulingError(
        failure("production_shift_not_started", "conflict"),
        "start",
        t
      )
    ).toBe("scheduling.errors.shiftNotStarted")
  })

  it("explains why a rewash cannot move to a later batch", () => {
    const message = presentOrderControlError(
      failure("hard_capacity_exceeded"),
      "preview",
      t
    )

    expect(message).toBe("orderControl.errors.hardCapacity")
    expect(message).not.toContain(diagnosticId)
  })

  it("uses an uncertainty-safe message when a committed route loses its response", () => {
    expect(
      presentOrderControlError(
        failure("network_unavailable", "unavailable"),
        "commit",
        t
      )
    ).toBe("orderControl.errors.commitUnknown")
  })

  it("maps feature failures to owner-local, actionable copy", () => {
    expect(
      presentAuthenticationError(failure("invalid_credentials"), "login", t)
    ).toBe("authentication.errors.invalidCredentials")
    expect(
      presentIntakeError(failure("production_order_intake_state_invalid"), t)
    ).toBe("intake.errors.noLongerPending")
    expect(
      presentHistoryError(
        failure("production_history_cursor_invalid"),
        "list",
        t
      )
    ).toBe("history.errors.cursorInvalid")
    expect(presentSettingsError(failure("scheduler_config_invalid"), t)).toBe(
      "settings.errors.invalid"
    )
    expect(
      presentProductionBoardError(failure("machine_unavailable"), "machines", t)
    ).toBe("production.errors.machineUnavailable")
    expect(presentPlacementFailure("hard_capacity_exceeded", t)).toBe(
      "production.errors.hardCapacity"
    )
  })

  it("presents structured operational warnings instead of raw server text", () => {
    const warning = presentScheduleWarning(
      {
        code: "NO_ACTIVE_WASHERS",
        message: "Raw server warning",
        blocking: true,
      },
      t
    )

    expect(warning).toEqual({
      title: "scheduling.warningNoWashersTitle",
      detail: "scheduling.warningNoWashersDetail",
    })
    expect(warning.detail).not.toContain("Raw server warning")
  })

  it("keeps candidate run identifiers out of pending-placement guidance", () => {
    const message = presentPendingPlacementMessage(
      {
        status: "ambiguous_run",
        reason: "multiple_started_runs",
        message: "Choose run 90ed1925-f197-46f4-8d41-3a3347544ddf",
        candidateProductionRunIds: [diagnosticId, crypto.randomUUID()],
      },
      t
    )

    expect(message).toBe("production.placementMultipleRuns")
    expect(message).not.toContain(diagnosticId)
  })

  it("keeps workspace diagnostics internal", () => {
    const message = presentAppError(
      failure("production_location_not_found"),
      "load_locations",
      englishAppMessages.errors
    )

    expect(message).toBe(englishAppMessages.errors.locationNotFound)
    expect(message).not.toContain(diagnosticId)
  })
})

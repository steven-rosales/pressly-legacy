import type { TFunction } from "i18next"
import type {
  ProductionLiveAutomaticPlacement,
  ProductionLiveExactBatchTarget,
} from "@pressly/production-system/contracts/read-models/production-board"
import { isRequestFailure } from "../../capabilities/request.error"

export type LivePlacementProjection =
  | ProductionLiveAutomaticPlacement
  | ProductionLiveExactBatchTarget

export const formatLiveRunMoment = (
  value: string,
  timezone: string,
  locale: string
): string =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value))

export const presentLivePlacementTarget = (
  placement: LivePlacementProjection,
  t: TFunction
): string =>
  placement.target.kind === "existing_batch"
    ? t("liveRunChanges.batchNumber", {
        number: placement.target.sequence + 1,
      })
    : t("liveRunChanges.newBatch")

export const presentLivePlacementFailure = (
  reason: string,
  t: TFunction
): string => {
  switch (reason) {
    case "hard_capacity_exceeded":
    case "no_mutable_position":
      return t("liveRunChanges.errors.noFit")
    case "run_not_started":
      return t("liveRunChanges.errors.runNotStarted")
    case "run_completed":
      return t("liveRunChanges.errors.runCompleted")
    case "order_not_eligible":
      return t("liveRunChanges.errors.orderNotEligible")
    case "order_already_scheduled":
      return t("liveRunChanges.errors.orderAlreadyPlaced")
    case "queue_conflict":
    case "proposal_stale":
      return t("liveRunChanges.errors.changed")
    default:
      return t("liveRunChanges.errors.actionFailed")
  }
}

export const presentLiveRunActionError = (
  cause: unknown,
  t: TFunction
): string => {
  if (!isRequestFailure(cause)) return t("liveRunChanges.errors.actionFailed")

  switch (cause.code.toLowerCase()) {
    case "production_run_not_found":
    case "production_board_not_found":
      return t("liveRunChanges.errors.runMissing")
    case "production_run_not_started":
      return t("liveRunChanges.errors.runNotStarted")
    case "production_run_completed":
    case "production_shift_closed":
      return t("liveRunChanges.errors.runCompleted")
    case "order_already_placed":
      return t("liveRunChanges.errors.orderAlreadyPlaced")
    case "order_not_eligible":
    case "order_not_ready_for_production":
      return t("liveRunChanges.errors.orderNotEligible")
    case "batch_capacity_exceeded":
    case "hard_capacity_exceeded":
      return t("liveRunChanges.errors.noFit")
    case "no_mutable_position":
      return t("liveRunChanges.errors.noFit")
    case "production_queue_version_conflict":
    case "production_batch_version_conflict":
    case "production_idempotency_conflict":
    case "overtime_confirmation_stale":
      return t("liveRunChanges.errors.changed")
  }

  if (cause.requestKind === "unauthorized")
    return t("liveRunChanges.errors.unauthorized")
  if (cause.requestKind === "forbidden")
    return t("liveRunChanges.errors.forbidden")
  if (cause.requestKind === "unavailable")
    return t("liveRunChanges.errors.unavailable")
  if (cause.requestKind === "invalid_response")
    return t("liveRunChanges.errors.invalidResponse")
  if (cause.requestKind === "conflict")
    return t("liveRunChanges.errors.changed")
  return t("liveRunChanges.errors.actionFailed")
}

import type { TFunction } from "i18next"
import { RequestFailure } from "@/ports/request.error"

export type SchedulingErrorOperation =
  | "compute"
  | "selection"
  | "priority"
  | "accept"
  | "start"

const fallbackMessage = (
  operation: SchedulingErrorOperation,
  t: TFunction
): string => {
  if (operation === "compute") return t("scheduling.errors.computeFailed")
  if (operation === "selection") return t("scheduling.errors.selectionFailed")
  if (operation === "priority") return t("scheduling.errors.priorityFailed")
  if (operation === "accept") return t("scheduling.errors.acceptFailed")
  return t("scheduling.errors.startUnknown")
}

export const presentSchedulingError = (
  cause: unknown,
  operation: SchedulingErrorOperation,
  t: TFunction
): string => {
  if (!(cause instanceof RequestFailure)) return fallbackMessage(operation, t)

  switch (cause.code.toLowerCase()) {
    case "production_shift_selection_version_conflict":
      return t("scheduling.errors.selectionChanged")
    case "production_shift_selection_not_ready":
    case "schedule_selection_not_ready":
      return t("scheduling.errors.selectionNotReady")
    case "schedule_selection_empty":
      return t("scheduling.selectBeforeComputing")
    case "production_shift_version_conflict":
      return t("scheduling.errors.shiftChanged")
    case "production_shift_already_started":
      return t("scheduling.errors.shiftStarted")
    case "production_shift_closed":
      return t("scheduling.errors.shiftClosed")
    case "production_shift_expired":
      return t("scheduling.errors.shiftEnded")
    case "production_shift_not_started":
      return t("scheduling.errors.shiftNotStarted")
    case "production_shift_window_invalid":
      return t("scheduling.errors.shiftWindowInvalid")
    case "scheduler_config_invalid":
      return t("scheduling.errors.configurationInvalid")
    case "schedule_hash_mismatch":
    case "schedule_not_current":
    case "schedule_not_draft":
    case "schedule_proposal_stale":
      return t("scheduling.errors.planStale")
    case "schedule_input_snapshot_stale":
      return t("scheduling.errors.demandChanged")
    case "schedule_not_accepted":
      return t("scheduling.errors.acceptBeforeStart")
    case "schedule_warning_not_acknowledged":
      return t("scheduling.errors.warningsRequired")
    case "schedule_warning_acknowledgement_invalid":
      return t("scheduling.errors.warningsChanged")
    case "schedule_has_no_batches":
      return t("scheduling.errors.noBatches")
    case "production_run_already_exists":
      return t("scheduling.errors.productionAlreadyStarted")
    case "production_order_version_conflict":
      return t("scheduling.errors.priorityChanged")
    case "production_shift_not_found":
    case "schedule_not_found":
    case "scheduling_input_not_found":
      return t("scheduling.errors.notFound")
  }

  if (cause.kind === "unauthorized") return t("scheduling.errors.unauthorized")
  if (cause.kind === "forbidden") return t("scheduling.errors.forbidden")
  if (cause.kind === "unavailable") return t("scheduling.errors.unavailable")
  if (cause.kind === "invalid_response")
    return t("scheduling.errors.invalidResponse")
  if (cause.kind === "conflict")
    return operation === "priority"
      ? t("scheduling.errors.priorityChanged")
      : operation === "selection"
        ? t("scheduling.errors.selectionChanged")
        : t("scheduling.errors.planStale")
  return fallbackMessage(operation, t)
}

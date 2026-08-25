import type { TFunction } from "i18next"
import { isRequestFailure } from "../../capabilities/request.error"

export type OrderControlErrorOperation =
  | "load"
  | "load_targets"
  | "preview"
  | "commit"

const fallbackMessage = (
  operation: OrderControlErrorOperation,
  t: TFunction
): string => {
  if (operation === "load") return t("orderControl.errors.loadFailed")
  if (operation === "load_targets")
    return t("orderControl.errors.targetsFailed")
  if (operation === "preview") return t("orderControl.errors.previewFailed")
  return t("orderControl.errors.commitUnknown")
}

export const presentOrderControlError = (
  cause: unknown,
  operation: OrderControlErrorOperation,
  t: TFunction
): string => {
  if (!isRequestFailure(cause)) return fallbackMessage(operation, t)

  switch (cause.code.toLowerCase()) {
    case "hard_capacity_exceeded":
    case "batch_capacity_exceeded":
      return t("orderControl.errors.hardCapacity")
    case "no_later_target":
      return t("orderControl.errors.noLaterTarget")
    case "no_feasible_target":
      return t("orderControl.errors.noFeasibleTarget")
    case "production_order_not_found":
    case "production_order_route_not_found":
      return t("orderControl.errors.orderUnavailable")
    case "production_order_not_scheduled":
      return t("orderControl.errors.orderNotScheduled")
    case "source_batch_would_be_empty":
      return t("orderControl.errors.sourceBatchEmpty")
    case "order_weight_invalid":
      return t("orderControl.errors.weightInvalid")
    case "queued_rebatch_source_not_queued":
    case "queued_rebatch_source_frozen":
      return t("orderControl.errors.queuedSourceRequired")
    case "exception_source_not_in_flight":
      return t("orderControl.errors.inFlightSourceRequired")
    case "source_current_stage_mismatch":
      return t("orderControl.errors.stageChanged")
    case "restart_stage_skips_required_work":
      return t("orderControl.errors.restartSkipsWork")
    case "target_stage_graph_invalid":
      return t("orderControl.errors.targetIncompatible")
    case "production_order_route_proposal_stale":
      return t("orderControl.errors.proposalStale")
    case "production_shift_closed":
    case "production_run_completed":
      return t("orderControl.errors.runClosed")
    case "production_queue_version_conflict":
    case "production_order_version_conflict":
    case "production_batch_version_conflict":
    case "production_idempotency_conflict":
      return t("orderControl.errors.conflict")
  }

  if (cause.requestKind === "unauthorized")
    return t("orderControl.errors.unauthorized")
  if (cause.requestKind === "forbidden")
    return t("orderControl.errors.forbidden")
  if (cause.requestKind === "unavailable")
    return operation === "commit"
      ? t("orderControl.errors.commitUnknown")
      : t("orderControl.errors.unavailable")
  if (cause.requestKind === "invalid_response")
    return operation === "commit"
      ? t("orderControl.errors.commitUnknown")
      : t("orderControl.errors.invalidResponse")
  if (cause.requestKind === "conflict") return t("orderControl.errors.conflict")
  return fallbackMessage(operation, t)
}

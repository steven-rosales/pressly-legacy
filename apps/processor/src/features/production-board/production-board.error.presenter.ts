import type { TFunction } from "i18next"
import { RequestFailure } from "@/ports/request.error"

export type ProductionBoardErrorOperation =
  | "load"
  | "stage"
  | "early_start"
  | "early_completion"
  | "machines"
  | "membership"
  | "placement"
  | "overtime"
  | "floor_preview"
  | "floor_commit"

const fallbackMessage = (
  operation: ProductionBoardErrorOperation,
  t: TFunction
): string => {
  if (operation === "load") return t("production.errors.boardLoadFailed")
  if (operation === "floor_preview")
    return t("production.errors.floorPreviewFailed")
  if (operation === "floor_commit")
    return t("production.errors.floorCommitUnknown")
  return t("production.errors.actionUnknown")
}

export const presentProductionBoardError = (
  cause: unknown,
  operation: ProductionBoardErrorOperation,
  t: TFunction
): string => {
  if (!(cause instanceof RequestFailure)) return fallbackMessage(operation, t)

  switch (cause.code.toLowerCase()) {
    case "production_board_not_found":
    case "production_run_not_found":
      return t("production.errors.boardMissing")
    case "production_run_not_started":
      return t("production.errors.runNotStarted")
    case "production_run_completed":
    case "production_shift_closed":
      return t("production.errors.runClosed")
    case "stage_run_not_found":
      return t("production.errors.stageMissing")
    case "planned_start_not_reached":
      return t("production.errors.plannedStartNotReached")
    case "pulse_boundary_not_reached":
      return t("production.errors.pulseBoundaryNotReached")
    case "stage_start_confirmation_stale":
    case "stage_completion_confirmation_stale":
    case "progress_reconciliation_confirmation_stale":
      return t("production.errors.confirmationStale")
    case "machine_not_found":
      return t("production.errors.machineMissing")
    case "machine_unavailable":
      return t("production.errors.machineUnavailable")
    case "machine_assigned_twice":
      return t("production.errors.machineDuplicated")
    case "machine_not_allowed_for_stage":
      return t("production.errors.machineWrongStage")
    case "machine_capacity_insufficient":
      return t("production.errors.machineCapacity")
    case "production_batch_not_found":
      return t("production.errors.batchMissing")
    case "batch_already_frozen":
      return t("production.errors.alreadyFrozen")
    case "batch_already_mutable":
      return t("production.errors.alreadyMutable")
    case "batch_freeze_forbidden":
      return t("production.errors.freezeForbidden")
    case "batch_unfreeze_forbidden":
      return t("production.errors.unfreezeForbidden")
    case "batch_membership_immutable":
      return t("production.errors.membershipImmutable")
    case "order_already_placed":
      return t("production.errors.orderAlreadyPlaced")
    case "order_not_eligible":
      return t("production.errors.orderNotEligible")
    case "order_not_ready_for_production":
      return t("production.errors.orderNotReady")
    case "batch_capacity_exceeded":
    case "hard_capacity_exceeded":
      return t("production.errors.hardCapacity")
    case "no_mutable_position":
      return t("production.errors.noMutableBatch")
    case "automatic_placement_forbidden":
    case "exact_placement_forbidden":
    case "overtime_confirmation_forbidden":
      return t("production.errors.placementForbidden")
    case "overtime_confirmation_required":
      return t("production.errors.overtimeRequired")
    case "overtime_confirmation_stale":
      return t("production.errors.overtimeStale")
    case "stage_run_version_conflict":
    case "production_queue_version_conflict":
    case "production_batch_version_conflict":
    case "production_idempotency_conflict":
    case "progress_reconciliation_confirmation_conflict":
      return t("production.errors.recordChanged")
  }

  if (cause.kind === "unauthorized") return t("production.errors.unauthorized")
  if (cause.kind === "forbidden") return t("production.errors.forbidden")
  if (cause.kind === "unavailable")
    return operation === "load"
      ? t("production.errors.unavailable")
      : fallbackMessage(operation, t)
  if (cause.kind === "invalid_response")
    return operation === "load"
      ? t("production.errors.invalidResponse")
      : fallbackMessage(operation, t)
  if (cause.kind === "conflict") return t("production.errors.recordChanged")
  return fallbackMessage(operation, t)
}

export const presentPlacementFailure = (
  reason: string,
  t: TFunction
): string => {
  switch (reason) {
    case "hard_capacity_exceeded":
      return t("production.errors.hardCapacity")
    case "run_not_started":
      return t("production.errors.runNotStarted")
    case "run_completed":
      return t("production.errors.runClosed")
    case "order_not_eligible":
      return t("production.errors.orderNotEligible")
    case "order_already_scheduled":
      return t("production.errors.orderAlreadyPlaced")
    case "no_mutable_position":
      return t("production.errors.noMutableBatch")
    case "queue_conflict":
    case "proposal_stale":
      return t("production.errors.recordChanged")
    default:
      return t("production.errors.actionUnknown")
  }
}

import type { TFunction } from "i18next"
import { RequestFailure } from "@/ports/request.error"

export const presentIntakeError = (cause: unknown, t: TFunction): string => {
  if (!(cause instanceof RequestFailure)) return t("intake.errors.recordFailed")

  switch (cause.code.toLowerCase()) {
    case "production_order_version_conflict":
      return t("intake.errors.changed")
    case "production_order_intake_state_invalid":
      return t("intake.errors.noLongerPending")
    case "production_order_not_found":
      return t("intake.errors.orderMissing")
    case "order_bag_count_invalid":
      return t("intake.errors.bagCountRejected")
  }

  if (cause.kind === "unauthorized") return t("intake.errors.unauthorized")
  if (cause.kind === "forbidden") return t("intake.errors.forbidden")
  if (cause.kind === "unavailable") return t("intake.errors.unavailable")
  if (cause.kind === "invalid_response")
    return t("intake.errors.invalidResponse")
  if (cause.kind === "conflict") return t("intake.errors.changed")
  return t("intake.errors.recordFailed")
}

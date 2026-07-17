import type { TFunction } from "i18next"
import { RequestFailure } from "@/ports/request.error"

export type HistoryErrorOperation = "list" | "detail"

const fallbackMessage = (
  operation: HistoryErrorOperation,
  t: TFunction
): string =>
  operation === "detail"
    ? t("history.errors.detailFailed")
    : t("history.errors.loadFailed")

export const presentHistoryError = (
  cause: unknown,
  operation: HistoryErrorOperation,
  t: TFunction
): string => {
  if (!(cause instanceof RequestFailure)) return fallbackMessage(operation, t)

  switch (cause.code.toLowerCase()) {
    case "production_history_cursor_invalid":
      return t("history.errors.cursorInvalid")
    case "production_history_run_not_found":
    case "production_run_not_found":
      return t("history.errors.runNotFound")
    case "production_location_not_found":
    case "production_location_unavailable":
      return t("history.errors.locationUnavailable")
  }

  if (cause.kind === "unauthorized") return t("history.errors.unauthorized")
  if (cause.kind === "forbidden") return t("history.errors.forbidden")
  if (cause.kind === "unavailable") return t("history.errors.unavailable")
  if (cause.kind === "invalid_response")
    return t("history.errors.invalidResponse")
  return fallbackMessage(operation, t)
}

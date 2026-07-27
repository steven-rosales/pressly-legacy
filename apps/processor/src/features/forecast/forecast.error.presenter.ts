import type { TFunction } from "i18next"
import { RequestFailure } from "@/ports/request.error"

export const presentForecastError = (cause: unknown, t: TFunction): string => {
  if (!(cause instanceof RequestFailure)) return t("forecast.errors.loadFailed")

  switch (cause.code.toLowerCase()) {
    case "production_location_not_found":
    case "production_location_unavailable":
      return t("forecast.errors.locationUnavailable")
    case "production_forecast_service_day_invalid":
      return t("forecast.errors.serviceDayInvalid")
    case "production_forecast_scope_too_large":
      return t("forecast.errors.scopeTooLarge")
    case "production_forecast_state_inconsistent":
      return t("forecast.errors.stateInconsistent")
  }

  if (cause.kind === "unauthorized") return t("forecast.errors.unauthorized")
  if (cause.kind === "forbidden") return t("forecast.errors.forbidden")
  if (cause.kind === "unavailable") return t("forecast.errors.unavailable")
  if (cause.kind === "invalid_response")
    return t("forecast.errors.invalidResponse")
  return t("forecast.errors.loadFailed")
}

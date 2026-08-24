import type { TFunction } from "i18next"
import { isRequestFailure } from "../../capabilities/request.error"

export const presentSettingsError = (cause: unknown, t: TFunction): string => {
  if (!isRequestFailure(cause)) return t("settings.errors.publishUnknown")

  switch (cause.code.toLowerCase()) {
    case "scheduler_config_invalid":
      return t("settings.errors.invalid")
    case "production_idempotency_conflict":
    case "scheduler_config_version_conflict":
      return t("settings.errors.conflict")
  }

  if (cause.requestKind === "unauthorized")
    return t("settings.errors.unauthorized")
  if (cause.requestKind === "forbidden") return t("settings.errors.forbidden")
  if (cause.requestKind === "unavailable")
    return t("settings.errors.unavailable")
  if (cause.requestKind === "invalid_response")
    return t("settings.errors.invalidResponse")
  if (cause.requestKind === "conflict") return t("settings.errors.conflict")
  return t("settings.errors.publishUnknown")
}

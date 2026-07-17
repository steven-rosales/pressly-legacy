import type { TFunction } from "i18next"
import { RequestFailure } from "@/ports/request.error"

export const presentSettingsError = (cause: unknown, t: TFunction): string => {
  if (!(cause instanceof RequestFailure))
    return t("settings.errors.publishUnknown")

  switch (cause.code.toLowerCase()) {
    case "scheduler_config_invalid":
      return t("settings.errors.invalid")
    case "production_idempotency_conflict":
    case "scheduler_config_version_conflict":
      return t("settings.errors.conflict")
  }

  if (cause.kind === "unauthorized") return t("settings.errors.unauthorized")
  if (cause.kind === "forbidden") return t("settings.errors.forbidden")
  if (cause.kind === "unavailable") return t("settings.errors.unavailable")
  if (cause.kind === "invalid_response")
    return t("settings.errors.invalidResponse")
  if (cause.kind === "conflict") return t("settings.errors.conflict")
  return t("settings.errors.publishUnknown")
}

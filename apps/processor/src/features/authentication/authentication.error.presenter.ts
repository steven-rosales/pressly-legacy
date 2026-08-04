import type { TFunction } from "i18next"
import { isRequestFailure } from "@/ports/request.error"

export type AuthenticationErrorOperation =
  | "login"
  | "verify"
  | "restore"
  | "logout"

const fallbackMessage = (
  operation: AuthenticationErrorOperation,
  t: TFunction
): string => {
  if (operation === "login") return t("authentication.errors.loginFailed")
  if (operation === "verify")
    return t("authentication.errors.verificationFailed")
  if (operation === "restore") return t("authentication.errors.restoreFailed")
  return t("authentication.errors.logoutFailed")
}

export const presentAuthenticationError = (
  cause: unknown,
  operation: AuthenticationErrorOperation,
  t: TFunction
): string => {
  if (!isRequestFailure(cause)) return fallbackMessage(operation, t)

  switch (cause.code.toLowerCase()) {
    case "invalid_credentials":
      return t("authentication.errors.invalidCredentials")
    case "login_rate_limited":
    case "rate_limit_exceeded":
      return t("authentication.errors.rateLimited")
    case "invalid_mfa_code":
      return t("authentication.errors.invalidMfaCode")
    case "invalid_mfa_challenge":
    case "expired_mfa_challenge":
    case "processor_mfa_challenge_missing":
      return t("authentication.errors.expiredMfaChallenge")
  }

  if (cause.requestKind === "forbidden")
    return t("authentication.errors.forbidden")
  if (cause.requestKind === "unavailable")
    return t("authentication.errors.unavailable")
  if (cause.requestKind === "invalid_response")
    return t("authentication.errors.invalidResponse")
  return fallbackMessage(operation, t)
}

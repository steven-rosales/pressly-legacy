import { isAppError, isRecord, type AppError } from "@pressly/errors/app-error"

export const controlRequestErrorKinds = [
  "session_refresh_required",
  "request_timeout",
  "service_unreachable",
  "unreadable_response",
  "authentication_required",
  "permission_denied",
  "record_not_found",
  "conflict",
  "invalid_request",
  "rate_limited",
  "service_unavailable",
  "request_rejected",
] as const

export type ControlRequestErrorKind = (typeof controlRequestErrorKinds)[number]

export type ControlRequestError = AppError &
  Readonly<{ controlKind: ControlRequestErrorKind }>

export const isControlRequestError = (
  value: unknown,
): value is ControlRequestError =>
  isAppError(value) &&
  isRecord(value) &&
  controlRequestErrorKinds.includes(
    value["controlKind"] as ControlRequestErrorKind,
  )

export const makeControlRequestError = (
  error: AppError,
  controlKind: ControlRequestErrorKind = requestKindFor(error),
): ControlRequestError => Object.freeze(Object.assign(error, { controlKind }))

const requestKindFor = (error: AppError): ControlRequestErrorKind => {
  switch (error.kind) {
    case "AuthError":
      return "authentication_required"
    case "PermissionError":
      return "permission_denied"
    case "NotFoundError":
      return "record_not_found"
    case "ConflictError":
      return "conflict"
    case "ValidationError":
      return "invalid_request"
    case "RateLimitError":
      return "rate_limited"
    case "ExternalServiceError":
    case "DatabaseError":
    case "InvariantViolationError":
    case "UnexpectedError":
    case "ConfigError":
      return "service_unavailable"
  }
}

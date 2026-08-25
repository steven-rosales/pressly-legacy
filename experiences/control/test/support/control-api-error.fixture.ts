import {
  makeControlRequestError,
  type ControlRequestError,
  type ControlRequestErrorKind,
} from "../../src/browser/control-request-error.ts"
import {
  makeAppError,
  type ErrorKind,
  type HttpStatusCode,
} from "@pressly/errors/app-error"

const appErrorKind = (controlKind: ControlRequestErrorKind): ErrorKind => {
  switch (controlKind) {
    case "authentication_required":
      return "AuthError"
    case "permission_denied":
      return "PermissionError"
    case "record_not_found":
      return "NotFoundError"
    case "conflict":
    case "session_refresh_required":
      return "ConflictError"
    case "invalid_request":
      return "ValidationError"
    case "rate_limited":
      return "RateLimitError"
    case "request_timeout":
    case "service_unreachable":
    case "unreadable_response":
    case "service_unavailable":
    case "request_rejected":
      return "ExternalServiceError"
  }
}

const defaultStatus = (kind: ErrorKind): HttpStatusCode => {
  switch (kind) {
    case "AuthError":
      return 401
    case "PermissionError":
      return 403
    case "NotFoundError":
      return 404
    case "ConflictError":
      return 409
    case "ValidationError":
      return 400
    case "RateLimitError":
      return 429
    case "ExternalServiceError":
    case "DatabaseError":
    case "InvariantViolationError":
    case "UnexpectedError":
    case "ConfigError":
      return 500
  }
}

export const controlApiErrorFixture = (
  controlKind: ControlRequestErrorKind,
  input: Readonly<{
    status?: HttpStatusCode
    code?: string
    traceId?: string
  }> = {},
): ControlRequestError => {
  const kind = appErrorKind(controlKind)
  return makeControlRequestError(
    makeAppError({
      kind,
      status: input.status ?? defaultStatus(kind),
      code: input.code ?? `test_${controlKind}`,
      message: `Test Control failure: ${controlKind}.`,
      safeMessage: "The test request failed.",
      ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
    }),
    controlKind,
  )
}

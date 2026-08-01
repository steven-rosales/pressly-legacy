import type { TFunction } from "i18next"
import {
  ControlApiError,
  type ControlApiErrorKind,
} from "@/api/control-http-client"

const messageKeyByKind = {
  session_refresh_required: "errors.sessionRefreshRequired",
  request_timeout: "errors.requestTimeout",
  service_unreachable: "errors.serviceUnreachable",
  unreadable_response: "errors.unreadableResponse",
  authentication_required: "errors.authenticationRequired",
  permission_denied: "errors.permissionDenied",
  record_not_found: "errors.recordNotFound",
  conflict: "errors.conflict",
  invalid_request: "errors.invalidRequest",
  rate_limited: "errors.rateLimited",
  service_unavailable: "errors.serviceUnavailable",
  request_rejected: "errors.requestRejected",
} as const satisfies Readonly<Record<ControlApiErrorKind, string>>

export const controlErrorMessage = (
  error: unknown,
  t: TFunction,
  fallback: string,
  options: Readonly<{
    conflict?: string
    codeMessages?: Readonly<Record<string, string>>
  }> = {},
) => {
  if (!(error instanceof ControlApiError)) return fallback
  if (error.code !== null) {
    const codeMessage = options.codeMessages?.[error.code]
    if (codeMessage !== undefined) return codeMessage
  }
  if (error.kind === "conflict" && options.conflict !== undefined)
    return options.conflict
  return t(messageKeyByKind[error.kind])
}

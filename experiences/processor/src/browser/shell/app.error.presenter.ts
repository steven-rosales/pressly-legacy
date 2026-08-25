import { isRequestFailure } from "../../capabilities/request.error"

export type AppErrorOperation = "load_locations" | "load_workspace"

export type AppErrorMessages = Readonly<{
  loadProduction: string
  loadLocations: string
  unauthorized: string
  forbidden: string
  conflict: string
  unavailable: string
  invalidResponse: string
  unexpected: string
  locationNotFound: string
  locationUnavailable: string
  workspaceNotFound: string
}>

const codeMessage = (
  code: string,
  messages: AppErrorMessages
): string | null => {
  switch (code.toLowerCase()) {
    case "production_location_not_found":
      return messages.locationNotFound
    case "production_location_unavailable":
      return messages.locationUnavailable
    case "production_board_not_found":
    case "production_run_not_found":
    case "production_history_run_not_found":
      return messages.workspaceNotFound
    default:
      return null
  }
}

export const presentAppError = (
  cause: unknown,
  operation: AppErrorOperation,
  messages: AppErrorMessages
): string => {
  if (!isRequestFailure(cause))
    return operation === "load_locations"
      ? messages.loadLocations
      : messages.loadProduction

  const specific = codeMessage(cause.code, messages)
  if (specific !== null) return specific
  if (cause.requestKind === "unauthorized") return messages.unauthorized
  if (cause.requestKind === "forbidden") return messages.forbidden
  if (cause.requestKind === "conflict") return messages.conflict
  if (cause.requestKind === "unavailable") return messages.unavailable
  if (cause.requestKind === "invalid_response") return messages.invalidResponse
  return messages.unexpected
}

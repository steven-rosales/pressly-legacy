import { normalizeUnknownError, type AppError } from "@pressly/errors/app-error"
import { apiFailure } from "@pressly/http"
import type { CliFailure } from "../model.ts"

export const cliFailureFromAppError = (error: AppError): CliFailure => {
  const presented = apiFailure(error).error
  return Object.freeze({
    kind: "diagnostic",
    code: presented.code,
    message: presented.message,
    ...(presented.traceId === undefined ? {} : { traceId: presented.traceId }),
    ...(presented.details === undefined ? {} : { details: presented.details }),
  })
}

export const cliFailureFromUnknown = (error: unknown): CliFailure =>
  cliFailureFromAppError(normalizeUnknownError(error))

export const captureAppError = (
  error: unknown,
  capture?: (error: AppError) => void,
): AppError => {
  const normalized = normalizeUnknownError(error)
  capture?.(normalized)
  return normalized
}

import type { CellOutcome, HttpResponse } from "@pressly/cells"
import {
  authError,
  conflictError,
  permissionError,
  rateLimitError,
} from "@pressly/errors/factories"
import type { ControlAuthFailure } from "./schemas.ts"

export type BrowserOutput<Data> = Readonly<{
  data: Data
  setCookieHeaders: readonly string[]
}>

const commonHeaders = Object.freeze({
  Pragma: "no-cache",
  Vary: "Origin",
})

const throwFailure = (failure: ControlAuthFailure): never => {
  const fields = {
    code: failure.code,
    message: failure.message,
    safeMessage: failure.safeMessage,
  }
  if (failure.kind === "rate_limit") throw rateLimitError(fields)
  if (failure.kind === "conflict") throw conflictError(fields)
  if (failure.kind === "permission") throw permissionError(fields)
  throw authError(fields)
}

export const presentControlBrowser = <Data>(
  _operationId: string,
  outcome: CellOutcome<BrowserOutput<Data>, ControlAuthFailure>,
  encodeData: (data: Data) => unknown,
): HttpResponse => {
  if (outcome.kind === "failure") {
    if (outcome.failure.setCookieHeaders.length === 0)
      return throwFailure(outcome.failure)
    const status =
      outcome.failure.kind === "authentication"
        ? 401
        : outcome.failure.kind === "permission"
          ? 403
          : outcome.failure.kind === "conflict"
            ? 409
            : 429
    return {
      status,
      headers: {
        ...commonHeaders,
        "Set-Cookie": outcome.failure.setCookieHeaders,
      },
      body: {
        ok: false,
        error: {
          code: outcome.failure.code,
          message: outcome.failure.safeMessage,
          ...(outcome.failure.traceId === undefined
            ? {}
            : { traceId: outcome.failure.traceId }),
        },
      },
    }
  }
  return {
    status: 200,
    headers:
      outcome.value.setCookieHeaders.length === 0
        ? commonHeaders
        : {
            ...commonHeaders,
            "Set-Cookie": outcome.value.setCookieHeaders,
          },
    body: { ok: true, data: encodeData(outcome.value.data) },
  }
}

export const presentControlAdminValue = <Output>(
  outcome: CellOutcome<Output, never>,
  encode: (output: Output) => unknown,
): HttpResponse => {
  if (outcome.kind === "failure") return outcome.failure
  return {
    status: 200,
    headers: commonHeaders,
    body: { ok: true, data: encode(outcome.value) },
  }
}

export const presentControlAdminAuth = <
  Output,
  Failure extends Readonly<{
    kind: "authentication" | "conflict" | "permission" | "rate_limit"
    code: string
    message: string
  }>,
>(
  outcome: CellOutcome<Output, Failure>,
  encode: (output: Output) => unknown,
): HttpResponse => {
  if (outcome.kind === "failure") {
    const fields = {
      code: outcome.failure.code,
      message: outcome.failure.message,
      safeMessage: outcome.failure.message,
    }
    if (outcome.failure.kind === "conflict") throw conflictError(fields)
    if (outcome.failure.kind === "permission") throw permissionError(fields)
    if (outcome.failure.kind === "rate_limit") throw rateLimitError(fields)
    throw authError(fields)
  }
  return {
    status: 200,
    headers: commonHeaders,
    body: { ok: true, data: encode(outcome.value) },
  }
}

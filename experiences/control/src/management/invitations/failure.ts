import type { CellOutcome, HttpResponse } from "@pressly/cells"
import {
  authError,
  conflictError,
  notFoundError,
  permissionError,
  rateLimitError,
  validationError,
} from "@pressly/errors/factories"
import type {
  InvitationFailure,
  InvitationValidationFailure,
} from "./contracts.ts"

type PeerFailure<
  Kind extends
    | "validation"
    | "authentication"
    | "permission"
    | "not_found"
    | "conflict"
    | "rate_limit",
> = Readonly<{
  kind: Kind
  code: string
  message: string
  details?: Readonly<{
    currentVersion?: number
    violations?: readonly string[]
    field?: string
  }>
}>

type InvitationFailureForKind<Kind extends InvitationFailure["kind"]> =
  Readonly<{
    kind: Kind
    code: string
    message: string
    safeMessage: string
    status?: 422
    traceId?: string
    details?: Readonly<{
      currentVersion?: number
      violations?: string[]
      field?: string
    }>
    setCookieHeaders: string[]
  }>

const details = (input: PeerFailure<InvitationFailure["kind"]>["details"]) =>
  input === undefined
    ? undefined
    : {
        ...(input.currentVersion === undefined
          ? {}
          : { currentVersion: input.currentVersion }),
        ...(input.violations === undefined
          ? {}
          : { violations: [...input.violations] }),
        ...(input.field === undefined ? {} : { field: input.field }),
      }

export const invitationPeerFailure = <Kind extends InvitationFailure["kind"]>(
  failure: PeerFailure<Kind>,
  setCookieHeaders: readonly string[] = [],
): InvitationFailureForKind<Kind> => {
  const publicDetails = details(failure.details)
  return {
    kind: failure.kind,
    code: failure.code,
    message: `Control peer rejected the request: ${failure.code}.`,
    safeMessage: failure.message,
    ...(publicDetails === undefined ? {} : { details: publicDetails }),
    setCookieHeaders: [...setCookieHeaders],
  }
}

export const invitationAuthFailure = <
  Kind extends "authentication" | "conflict" | "rate_limit",
>(
  failure: Readonly<{
    kind: Kind
    code: string
    message: string
  }>,
  setCookieHeaders: readonly string[] = [],
  traceId?: string,
): InvitationFailureForKind<Kind> => ({
  kind: failure.kind,
  code: failure.code,
  message: failure.message,
  safeMessage: failure.message,
  ...(traceId === undefined ? {} : { traceId }),
  setCookieHeaders: [...setCookieHeaders],
})

export const invitationModeFailure = (
  message: string,
): InvitationValidationFailure => ({
  kind: "validation",
  code: "invitation_identity_mode_invalid",
  message,
  safeMessage: "Choose the correct invitation acceptance option.",
  status: 422,
  setCookieHeaders: [],
})

export const invitationExistingIdentityRequired =
  (): InvitationValidationFailure => ({
    kind: "validation",
    code: "invitation_existing_identity_required",
    message:
      "Credential bootstrap was requested for a new invitation identity.",
    safeMessage: "Choose the new account option for this invitation.",
    status: 422,
    setCookieHeaders: [],
  })

const statusFor = (
  failure: InvitationFailure,
): 400 | 401 | 403 | 404 | 409 | 422 | 429 =>
  failure.status ??
  (failure.kind === "validation"
    ? 400
    : failure.kind === "authentication"
      ? 401
      : failure.kind === "permission"
        ? 403
        : failure.kind === "not_found"
          ? 404
          : failure.kind === "conflict"
            ? 409
            : 429)

const throwFailure = (failure: InvitationFailure): never => {
  const publicDetails =
    failure.details === undefined
      ? undefined
      : {
          ...(failure.details.currentVersion === undefined
            ? {}
            : { currentVersion: failure.details.currentVersion }),
          ...(failure.details.violations === undefined
            ? {}
            : { violations: [...failure.details.violations] }),
          ...(failure.details.field === undefined
            ? {}
            : { field: failure.details.field }),
        }
  const fields = {
    code: failure.code,
    message: failure.message,
    safeMessage: failure.safeMessage,
    ...(publicDetails === undefined ? {} : { publicDetails }),
  }
  if (failure.kind === "validation")
    throw validationError({
      ...fields,
      ...(failure.status === undefined ? {} : { status: failure.status }),
    })
  if (failure.kind === "authentication") throw authError(fields)
  if (failure.kind === "permission") throw permissionError(fields)
  if (failure.kind === "not_found") throw notFoundError(fields)
  if (failure.kind === "conflict") throw conflictError(fields)
  throw rateLimitError(fields)
}

export const presentInvitationValue = <Output>(
  outcome: CellOutcome<Output, InvitationFailure>,
  encode: (value: Output) => unknown,
  status = 200,
): HttpResponse => {
  if (outcome.kind === "failure") return throwFailure(outcome.failure)
  return { status, body: { ok: true, data: encode(outcome.value) } }
}

export const presentInvitationBrowser = <Data>(
  outcome: CellOutcome<
    Readonly<{ data: Data; setCookieHeaders: readonly string[] }>,
    InvitationFailure
  >,
  encode: (value: Data) => unknown,
): HttpResponse => {
  if (outcome.kind === "failure") {
    if (outcome.failure.setCookieHeaders.length === 0)
      return throwFailure(outcome.failure)
    return {
      status: statusFor(outcome.failure),
      headers: { "Set-Cookie": outcome.failure.setCookieHeaders },
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
    ...(outcome.value.setCookieHeaders.length === 0
      ? {}
      : { headers: { "Set-Cookie": outcome.value.setCookieHeaders } }),
    body: { ok: true, data: encode(outcome.value.data) },
  }
}

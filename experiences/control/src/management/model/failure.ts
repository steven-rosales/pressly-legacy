import type { CellOutcome, HttpResponse } from "@pressly/cells"
import {
  authError,
  conflictError,
  notFoundError,
  permissionError,
  rateLimitError,
  validationError,
} from "@pressly/errors/factories"
import { z } from "zod"

const categorySchema = z.enum([
  "validation",
  "authentication",
  "permission",
  "not_found",
  "conflict",
  "rate_limit",
])

const peerFailureSchema = <
  Kind extends "customer_rejected" | "order_rejected" | "workforce_rejected",
>(
  kind: Kind,
) =>
  z
    .object({
      kind: z.literal(kind),
      category: categorySchema,
      code: z.string(),
      message: z.string(),
      details: z
        .object({
          currentVersion: z.number().optional(),
          violations: z.array(z.string()).optional(),
          field: z.string().optional(),
        })
        .strict()
        .optional(),
    })
    .strict()

export const controlCustomerFailureSchema =
  peerFailureSchema("customer_rejected")
export const controlOrderFailureSchema = peerFailureSchema("order_rejected")
export const controlWorkforceFailureSchema =
  peerFailureSchema("workforce_rejected")
export const controlLocationNotFoundFailureSchema = z
  .object({
    kind: z.literal("location_not_found"),
    requestedLocationId: z.string(),
  })
  .strict()

export const controlOrderOrLocationFailureSchema = z.discriminatedUnion(
  "kind",
  [controlOrderFailureSchema, controlLocationNotFoundFailureSchema],
)

export const controlManagementFailureSchema = z.discriminatedUnion("kind", [
  controlCustomerFailureSchema,
  controlOrderFailureSchema,
  controlWorkforceFailureSchema,
  controlLocationNotFoundFailureSchema,
])

export type ControlManagementFailure = z.output<
  typeof controlManagementFailureSchema
>
export type ControlCustomerFailure = z.output<
  typeof controlCustomerFailureSchema
>
export type ControlOrderFailure = z.output<typeof controlOrderFailureSchema>
export type ControlWorkforceFailure = z.output<
  typeof controlWorkforceFailureSchema
>
export type ControlLocationNotFoundFailure = z.output<
  typeof controlLocationNotFoundFailureSchema
>
export type ControlOrderOrLocationFailure = z.output<
  typeof controlOrderOrLocationFailureSchema
>

type SystemFailure = Readonly<{
  kind:
    | "validation"
    | "authentication"
    | "permission"
    | "not_found"
    | "conflict"
  code: string
  message?: string
  details?: Readonly<{
    currentVersion?: number
    violations?: readonly string[]
    field?: string
  }>
}>

const failureDetails = (
  details: SystemFailure["details"],
):
  | Readonly<{
      currentVersion?: number
      violations?: string[]
      field?: string
    }>
  | undefined =>
  details === undefined
    ? undefined
    : {
        ...(details.currentVersion === undefined
          ? {}
          : { currentVersion: details.currentVersion }),
        ...(details.violations === undefined
          ? {}
          : { violations: [...details.violations] }),
        ...(details.field === undefined ? {} : { field: details.field }),
      }

const customerFailureMessage = (failure: SystemFailure): string => {
  if (failure.kind === "validation") return "The customer request is invalid."
  if (failure.kind === "not_found") return "The customer was not found."
  if (failure.kind === "conflict")
    return failure.code === "user_version_conflict"
      ? "The customer changed. Refresh and try again."
      : "The customer request conflicts with current state."
  return failure.message ?? "The customer request was rejected."
}

export const customerFailure = (
  failure: SystemFailure,
): ControlCustomerFailure => {
  const details = failureDetails(failure.details)
  return {
    kind: "customer_rejected",
    category: failure.kind,
    code: failure.code,
    message: customerFailureMessage(failure),
    ...(details === undefined ? {} : { details }),
  }
}

export const orderFailure = (
  failure: SystemFailure & Readonly<{ message: string }>,
): ControlOrderFailure => {
  const details = failureDetails(failure.details)
  return {
    kind: "order_rejected",
    category: failure.kind,
    code: failure.code,
    message: failure.message,
    ...(details === undefined ? {} : { details }),
  }
}

export const workforceFailure = (
  failure: SystemFailure & Readonly<{ message: string }>,
): ControlWorkforceFailure => {
  const details = failureDetails(failure.details)
  return {
    kind: "workforce_rejected",
    category: failure.kind,
    code: failure.code,
    message: failure.message,
    ...(details === undefined ? {} : { details }),
  }
}

const throwFailure = (failure: ControlManagementFailure): never => {
  if (failure.kind === "location_not_found")
    throw notFoundError({
      code: "control_location_not_found",
      message: `Requested location ${failure.requestedLocationId} is outside the Control access boundary.`,
      safeMessage: "The production location was not found.",
    })
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
    message: `Control peer rejected the request: ${failure.code}.`,
    safeMessage: failure.message,
    ...(publicDetails === undefined ? {} : { publicDetails }),
  }
  if (failure.category === "validation") throw validationError(fields)
  if (failure.category === "authentication") throw authError(fields)
  if (failure.category === "permission") throw permissionError(fields)
  if (failure.category === "not_found") throw notFoundError(fields)
  if (failure.category === "conflict") throw conflictError(fields)
  throw rateLimitError(fields)
}

export const presentControlManagement = <Output>(
  outcome: CellOutcome<Output, ControlManagementFailure>,
  encode: (output: Output) => unknown,
  status = 200,
): HttpResponse => {
  if (outcome.kind === "failure") return throwFailure(outcome.failure)
  return { status, body: { ok: true, data: encode(outcome.value) } }
}

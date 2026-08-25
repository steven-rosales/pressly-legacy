import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  authError,
  invariantViolationError,
  validationError,
} from "@pressly/errors/factories"
import type { z } from "zod"
import {
  principalContextSchema,
  requestMetadataSchema,
  type PrincipalContext,
} from "./schemas.ts"

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const invalid = (location: "body" | "params", error: z.ZodError): never => {
  throw validationError({
    code: `invalid_${location}_type`,
    message: `Validation ${location} failed.`,
    publicDetails: {
      location,
      issues: error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    },
  })
}

export const validateBody =
  (schema: z.ZodType) =>
  (request: HttpRequestInput): undefined => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) invalid("body", parsed.error)
    return undefined
  }
export const validateParams =
  (schema: z.ZodType) =>
  (request: HttpRequestInput): undefined => {
    const parsed = schema.safeParse(request.params)
    if (!parsed.success) invalid("params", parsed.error)
    return undefined
  }

const parsed = <Value extends object>(
  location: "body" | "params",
  value: unknown,
  schema: z.ZodType<Value>,
): Value => {
  const result = schema.safeParse(value)
  if (!result.success) invalid(location, result.error)
  if (result.data === undefined)
    throw invariantViolationError({
      code: `control_auth_${location}_parser_returned_undefined`,
      message: `A successful ${location} schema parse returned undefined.`,
      safeMessage: "The request could not be completed.",
    })
  return result.data
}
export const parsedBody = <Value extends object>(
  request: HttpRequest,
  schema: z.ZodType<Value>,
): Value => parsed("body", request.body, schema)
export const parsedParams = <Value extends object>(
  request: HttpRequest,
  schema: z.ZodType<Value>,
): Value => parsed("params", request.params, schema)

export const requestMetadata = (request: HttpRequest) => {
  const result = requestMetadataSchema.safeParse(
    isRecord(request.context) ? request.context["requestMetadata"] : undefined,
  )
  if (!result.success) return {}
  return {
    ...(result.data.ipAddress === undefined
      ? {}
      : { ipAddress: result.data.ipAddress }),
    ...(result.data.userAgent === undefined
      ? {}
      : { userAgent: result.data.userAgent }),
    ...(result.data.requestId === undefined
      ? {}
      : { requestId: result.data.requestId }),
  }
}
export const requestId = (request: HttpRequest): string | undefined =>
  requestMetadata(request).requestId

export const principalContext = (request: HttpRequest): PrincipalContext => {
  const result = principalContextSchema.safeParse(
    isRecord(request.context) ? request.context["principal"] : undefined,
  )
  if (result.success) return result.data
  throw authError({
    code: "authenticated_principal_context_missing",
    message: "Authenticated principal context was not provided.",
    safeMessage: "Authentication is required.",
  })
}

export const bearerToken = (request: HttpRequest): string => {
  const authorization = request.headers["authorization"]
  if (authorization !== undefined) {
    const [scheme, token] = authorization.split(" ")
    if (scheme === "Bearer" && token !== undefined && token.trim() !== "")
      return token
  }

  throw authError({
    code: "missing_bearer_token",
    message: "Bearer token is required.",
    safeMessage: "Authentication is required.",
  })
}

const contextToken = (
  request: HttpRequest,
  key: "challengeToken" | "sessionToken",
  code: string,
  message: string,
): string => {
  const value = isRecord(request.context) ? request.context[key] : undefined
  if (typeof value === "string" && value.length > 0) return value
  throw authError({
    code,
    message,
    safeMessage: "Authentication is required.",
  })
}

export const controlSessionToken = (request: HttpRequest): string =>
  contextToken(
    request,
    "sessionToken",
    "control_session_missing",
    "Control session cookie is missing.",
  )
export const controlChallengeToken = (request: HttpRequest): string =>
  contextToken(
    request,
    "challengeToken",
    "control_mfa_challenge_missing",
    "Control MFA challenge cookie is missing.",
  )

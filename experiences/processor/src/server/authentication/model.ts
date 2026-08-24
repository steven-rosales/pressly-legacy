import type { AccessExperienceOperations } from "@pressly/access-system/capabilities/experience-access-v1"
import {
  authError,
  conflictError,
  invariantViolationError,
  permissionError,
  rateLimitError,
  validationError,
} from "@pressly/errors/factories"
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type BoundaryContract,
  type CellContract,
  type CellOutcome,
  type ContractIssue,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
} from "@pressly/cells"
import { z } from "zod"

export type AccessCellName = keyof AccessExperienceOperations
export type AccessExecute<Name extends AccessCellName> = Pick<
  AccessExperienceOperations[Name],
  "execute"
>
export type AccessInput<Name extends AccessCellName> = Parameters<
  AccessExperienceOperations[Name]["execute"]
>[0]
export type AccessOutcome<Name extends AccessCellName> = Awaited<
  ReturnType<AccessExperienceOperations[Name]["execute"]>
>
export type AccessSuccess<Name extends AccessCellName> = Extract<
  AccessOutcome<Name>,
  Readonly<{ kind: "success" }>
>["value"]

const canonicalUtcIsoSchema = z.string().refine((value) => {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}, "Expected a canonical UTC ISO datetime.")
export const processorAuthUtcDateSchema = z.codec(
  canonicalUtcIsoSchema,
  z.date(),
  {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  }
)

export const processorLoginBodySchema = z
  .object({ email: z.email(), password: z.string().min(8) })
  .strict()
export const processorRequestMetadataSchema = z
  .object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    requestId: z.string().optional(),
  })
  .strict()
export const processorLoginInputSchema = processorRequestMetadataSchema.extend({
  email: z.email(),
  password: z.string().min(8),
})
export const processorChallengeBodySchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("totp"),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      method: z.literal("recovery"),
      code: z.string().min(16).max(40),
    })
    .strict(),
])
export const processorChallengeInputSchema = z.union(
  processorChallengeBodySchema.options.map((schema) =>
    schema.extend({
      challengeToken: z.string().min(1),
      requestId: z.string().optional(),
    })
  )
)
export const processorCookieSessionInputSchema = z
  .object({ sessionToken: z.string().min(1), requestId: z.string().optional() })
  .strict()

const processorCapabilitySchema = z.enum([
  "processor:view",
  "production:read",
  "production:schedule",
  "production:accept",
  "production:start",
  "production:queue",
  "production:override",
  "production:priority",
  "production:intake",
  "production:admission",
  "production:resources",
  "production:stage",
])
const processorApplicationSchema = z
  .object({
    id: z.enum(["processor", "control"]),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(160),
    href: z
      .url()
      .max(300)
      .refine((href) => {
        const url = new URL(href)
        return (
          (url.protocol === "https:" || url.protocol === "http:") &&
          url.username.length === 0 &&
          url.password.length === 0 &&
          url.pathname === "/" &&
          url.search.length === 0 &&
          url.hash.length === 0
        )
      }),
  })
  .strict()
export const processorAccessSchema = z
  .object({
    locations: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(200),
            name: z.string().trim().min(1).max(200),
            timezone: z.string().trim().min(1).max(100),
            capabilities: z
              .array(processorCapabilitySchema)
              .max(processorCapabilitySchema.options.length)
              .refine(
                (capabilities) =>
                  new Set(capabilities).size === capabilities.length
              ),
          })
          .strict()
      )
      .max(100),
    applications: z.array(processorApplicationSchema).max(2),
  })
  .strict()
export const processorSessionSchema = z
  .object({
    status: z.literal("authenticated"),
    principal: z
      .object({
        identityId: z.uuid(),
        displayName: z.string().trim().min(1).max(200),
        email: z.email().optional(),
      })
      .strict(),
    access: processorAccessSchema,
    expiresAt: processorAuthUtcDateSchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
export const processorLoginDataSchema = z.discriminatedUnion("status", [
  processorSessionSchema,
  z
    .object({
      status: z.literal("mfa_required"),
      expiresAt: processorAuthUtcDateSchema,
    })
    .strict(),
])
export const processorSetCookieHeadersSchema = z.array(
  z
    .string()
    .min(1)
    .refine((value) => !/[\r\n]/.test(value))
)
const browserOutput = <Data extends z.ZodType>(data: Data) =>
  z.object({ data, setCookieHeaders: processorSetCookieHeadersSchema }).strict()
export const processorLoginOutputSchema = browserOutput(
  processorLoginDataSchema
)
export const processorSessionOutputSchema = browserOutput(
  processorSessionSchema
)
export const processorLogoutDataSchema = z
  .object({ revoked: z.literal(true) })
  .strict()
export const processorLogoutOutputSchema = browserOutput(
  processorLogoutDataSchema
)
export const processorAuthFailureSchema = z
  .object({
    kind: z.enum(["authentication", "conflict", "permission", "rate_limit"]),
    code: z.string(),
    message: z.string(),
    safeMessage: z.string(),
    traceId: z.string().optional(),
    setCookieHeaders: processorSetCookieHeadersSchema,
  })
  .strict()

export type ProcessorLoginInput = z.output<typeof processorLoginInputSchema>
export type ProcessorChallengeInput = z.output<
  typeof processorChallengeInputSchema
>
export type ProcessorCookieSessionInput = z.output<
  typeof processorCookieSessionInputSchema
>
export type ProcessorAccess = z.output<typeof processorAccessSchema>
export type ProcessorSession = z.output<typeof processorSessionSchema>
export type ProcessorLoginData = z.output<typeof processorLoginDataSchema>
export type ProcessorLoginOutput = z.output<typeof processorLoginOutputSchema>
export type ProcessorSessionOutput = z.output<
  typeof processorSessionOutputSchema
>
export type ProcessorLogoutData = z.output<typeof processorLogoutDataSchema>
export type ProcessorLogoutOutput = z.output<typeof processorLogoutOutputSchema>
export type ProcessorAuthFailure = z.output<typeof processorAuthFailureSchema>

const contractIssues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[]
    message: string
  }>[]
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }))
const serializedIssues = (
  value: unknown,
  path: readonly (string | number)[] = [],
  ancestors: ReadonlySet<object> = new Set()
): readonly ContractIssue[] => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return []
  if (typeof value === "number")
    return Number.isFinite(value)
      ? []
      : [{ path, message: "Numbers must be finite." }]
  if (value === undefined)
    return [{ path, message: "Undefined is not serialized data." }]
  if (typeof value !== "object")
    return [{ path, message: "Expected a JSON-compatible value." }]
  if (ancestors.has(value))
    return [{ path, message: "Cyclic values are not serialized data." }]
  const nextAncestors = new Set(ancestors).add(value)
  if (Array.isArray(value))
    return value.flatMap((entry, index) =>
      serializedIssues(entry, [...path, index], nextAncestors)
    )
  const prototype = Object.getPrototypeOf(value) as unknown
  if (prototype !== Object.prototype && prototype !== null)
    return [{ path, message: "Expected a plain serialized object." }]
  return Object.entries(value).flatMap(([key, entry]) =>
    serializedIssues(entry, [...path, key], nextAncestors)
  )
}
const boundary = <Value>(
  schema: z.ZodType<Value>,
  label: string
): BoundaryContract<Value> =>
  defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const representationIssues = serializedIssues(serialized)
      if (representationIssues.length > 0)
        return decode.invalid(representationIssues)
      const parsed = z.safeDecode(schema, serialized)
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(contractIssues(parsed.error.issues))
    },
    encode: (value) => {
      const encoded = z.safeEncode(schema, value)
      if (encoded.success && serializedIssues(encoded.data).length === 0)
        return encoded.data
      throw invariantViolationError({
        code: "processor_auth_contract_encode_invalid",
        message: `${label} did not encode as strict serialized data.`,
        safeMessage: "Authentication data is inconsistent.",
        cause: encoded.success ? undefined : encoded.error,
      })
    },
  })
export const defineProcessorAuthContract = <Input, Output, Failure>(input: {
  label: string
  input: z.ZodType<Input>
  output: z.ZodType<Output>
  failure: z.ZodType<Failure>
}): CellContract<Input, Output, Failure> =>
  defineCellContract({
    input: boundary(input.input, `${input.label} input`),
    output: boundary(input.output, `${input.label} output`),
    failure: boundary(input.failure, `${input.label} failure`),
  })
export const encodeProcessorAuthValue = <Value>(
  schema: z.ZodType<Value>,
  value: Value,
  label: string
): unknown => {
  const encoded = z.safeEncode(schema, value)
  if (encoded.success && serializedIssues(encoded.data).length === 0)
    return encoded.data
  throw invariantViolationError({
    code: "processor_auth_presentation_encode_invalid",
    message: `${label} did not encode as strict serialized data.`,
    safeMessage: "Authentication data is inconsistent.",
    cause: encoded.success ? undefined : encoded.error,
  })
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const invalidBody = (error: z.ZodError): never => {
  throw validationError({
    code: "invalid_body_type",
    message: "Validation body failed.",
    publicDetails: {
      location: "body",
      issues: error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    },
  })
}
export const validateProcessorAuthBody =
  (schema: z.ZodType) =>
  (request: HttpRequestInput): undefined => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) invalidBody(parsed.error)
    return undefined
  }
export const parsedProcessorAuthBody = <Value extends object>(
  request: HttpRequest,
  schema: z.ZodType<Value>
): Value => {
  const parsed = schema.safeParse(request.body)
  if (!parsed.success) invalidBody(parsed.error)
  if (parsed.data === undefined)
    throw invariantViolationError({
      code: "processor_auth_body_parser_returned_undefined",
      message: "A successful body schema parse returned undefined.",
    })
  return parsed.data
}
export const processorRequestMetadata = (request: HttpRequest) => {
  const parsed = processorRequestMetadataSchema.safeParse(
    isRecord(request.context) ? request.context["requestMetadata"] : undefined
  )
  if (!parsed.success) return {}
  return {
    ...(parsed.data.ipAddress === undefined
      ? {}
      : { ipAddress: parsed.data.ipAddress }),
    ...(parsed.data.userAgent === undefined
      ? {}
      : { userAgent: parsed.data.userAgent }),
    ...(parsed.data.requestId === undefined
      ? {}
      : { requestId: parsed.data.requestId }),
  }
}
export const processorRequestId = (request: HttpRequest): string | undefined =>
  processorRequestMetadata(request).requestId
const contextToken = (
  request: HttpRequest,
  key: "challengeToken" | "sessionToken",
  code: string,
  message: string
): string => {
  const token = isRecord(request.context) ? request.context[key] : undefined
  if (typeof token === "string" && token.length > 0) return token
  throw authError({
    code,
    message,
    safeMessage: "Authentication is required.",
  })
}
export const processorSessionToken = (request: HttpRequest): string =>
  contextToken(
    request,
    "sessionToken",
    "processor_session_missing",
    "Processor session cookie is missing."
  )
export const processorChallengeToken = (request: HttpRequest): string =>
  contextToken(
    request,
    "challengeToken",
    "processor_mfa_challenge_missing",
    "Processor MFA challenge cookie is missing."
  )

export type ProcessorCookieMutation =
  | Readonly<{ action: "clear"; cookie: "mfa" | "session" }>
  | Readonly<{
      action: "set"
      cookie: "mfa" | "session"
      value: string
      expiresAt: Date
    }>
export type ProcessorBrowserPresentation = Readonly<{
  deriveCsrfToken: (sessionToken: string) => string
  serializeCookies: (
    mutations: readonly ProcessorCookieMutation[]
  ) => readonly string[]
}>
export type ResolveProcessorAccess = (
  session: AccessSuccess<"loadSession">
) => Promise<ProcessorAccess | null>

export const processorAccessFailure = (
  failure: Readonly<{
    kind: "authentication" | "conflict" | "rate_limit"
    code: string
    message: string
  }>,
  setCookieHeaders: readonly string[] = [],
  traceId?: string
): ProcessorAuthFailure => ({
  kind: failure.kind,
  code: failure.code,
  message: failure.message,
  safeMessage: failure.message,
  ...(traceId === undefined ? {} : { traceId }),
  setCookieHeaders: [...setCookieHeaders],
})

const commonHeaders = Object.freeze({ Pragma: "no-cache", Vary: "Origin" })
const throwProcessorFailure = (failure: ProcessorAuthFailure): never => {
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
export const presentProcessorAuth = <Data>(
  outcome: CellOutcome<
    Readonly<{ data: Data; setCookieHeaders: readonly string[] }>,
    ProcessorAuthFailure
  >,
  encodeData: (data: Data) => unknown
): HttpResponse => {
  if (outcome.kind === "failure") {
    if (outcome.failure.setCookieHeaders.length === 0)
      return throwProcessorFailure(outcome.failure)
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

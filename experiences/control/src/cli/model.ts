import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type BoundaryContract,
  type CellContract,
  type CellOutcome,
  type ContractIssue,
} from "@pressly/cells"
import { invariantViolationError } from "@pressly/errors/factories"
import { z } from "zod"

export type CliJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly CliJsonValue[]
  | Readonly<{ [key: string]: CliJsonValue }>

export const cliJsonValueSchema: z.ZodType<CliJsonValue> = z.json()

export type CliFailure = Readonly<{
  kind: "diagnostic"
  code: string
  message: string
  traceId?: string | undefined
  details?: CliJsonValue | undefined
}>

type SerializedCliFailure = Omit<CliFailure, "kind">

export const cliFailureSchema: z.ZodType<SerializedCliFailure> = z
  .object({
    code: z.string().min(1),
    message: z.string(),
    traceId: z.string().min(1).optional(),
    details: cliJsonValueSchema.optional(),
  })
  .strict()

export const cliPrincipalSchema = z
  .object({
    identityId: z.string().min(1),
    displayName: z.string().min(1),
    email: z.email().optional(),
    roles: z.array(z.string()),
  })
  .strict()

export const cliSessionSchema = z
  .object({
    accessToken: z.string().min(1),
    expiresAt: z.string().min(1),
    principal: cliPrincipalSchema,
  })
  .strict()

export type CliSession = z.output<typeof cliSessionSchema>

export const cliSessionResultSchema = cliSessionSchema
  .omit({ accessToken: true })
  .strict()

export type CliSessionResult = z.output<typeof cliSessionResultSchema>

export const cliLoginResultSchema = z.union([
  cliSessionSchema,
  z
    .object({
      status: z.literal("mfa_required"),
      challengeToken: z.string().min(1),
      expiresAt: z.string().min(1),
    })
    .strict(),
])

export type CliLoginResult = z.output<typeof cliLoginResultSchema>

export const cliMfaEnrollmentSchema = z
  .object({
    secret: z.string().min(1),
    enrollmentUri: z.string().min(1),
  })
  .strict()

export type CliMfaEnrollment = z.output<typeof cliMfaEnrollmentSchema>

export const cliRecoveryCodesSchema = z
  .object({ recoveryCodes: z.array(z.string()) })
  .strict()

export type CliRecoveryCodes = z.output<typeof cliRecoveryCodesSchema>

export const cliMfaMutationSchema = z.object({ updated: z.boolean() }).strict()

export type CliMfaMutation = z.output<typeof cliMfaMutationSchema>

export const cliLogoutSchema = z.object({ revoked: z.boolean() }).strict()

export type CliLogout = z.output<typeof cliLogoutSchema>

export type CliOutcome<Value> = Promise<CellOutcome<Value, CliFailure>>

export type AdminCliSessionStore = Readonly<{
  read: () => CliOutcome<CliSession | undefined>
  write: (session: CliSession) => CliOutcome<void>
  clear: () => CliOutcome<void>
}>

export type AdminCliAuthApi = Readonly<{
  login: (
    input: Readonly<{ email: string; password: string }>,
  ) => CliOutcome<CliLoginResult>
  completeMfaChallenge: (
    input: Readonly<{
      challengeToken: string
      method: "recovery" | "totp"
      code: string
    }>,
  ) => CliOutcome<CliSession>
  loadSession: (accessToken: string) => CliOutcome<CliSessionResult>
  logout: (accessToken: string) => CliOutcome<CliLogout>
  beginMfaEnrollment: (accessToken: string) => CliOutcome<CliMfaEnrollment>
  confirmMfaEnrollment: (
    accessToken: string,
    code: string,
  ) => CliOutcome<CliRecoveryCodes>
  regenerateMfaRecoveryCodes: (
    accessToken: string,
  ) => CliOutcome<CliRecoveryCodes>
  removeMfa: (accessToken: string) => CliOutcome<CliMfaMutation>
}>

export const pricingItemSchema = z
  .object({
    service: z.string(),
    category: z.string(),
    name: z.string(),
    unit: z.string(),
    priceCents: z.number().int(),
    sortOrder: z.number().int(),
    metadata: cliJsonValueSchema,
  })
  .strict()

export const pricingCatalogSchema = z
  .object({
    serviceSlug: z.enum(["wash-fold", "dry-cleaning"]),
    currency: z.string(),
    updatedAt: z.string(),
    items: z.array(pricingItemSchema),
  })
  .strict()

export type PricingCatalog = z.output<typeof pricingCatalogSchema>

export const pricingChangeItemSchema = z
  .object({ code: z.string().min(1), priceCents: z.number().int() })
  .strict()

export const pricingChangeInputSchema = z
  .object({
    serviceSlug: z.enum(["wash-fold", "dry-cleaning"]),
    reason: z.string(),
    items: z.array(pricingChangeItemSchema),
  })
  .strict()

export type PricingChangeInput = z.output<typeof pricingChangeInputSchema>

export const pricingPlanSchema = z
  .object({
    serviceSlug: z.enum(["wash-fold", "dry-cleaning"]),
    reason: z.string(),
    oldPricingSetId: z.string(),
    currency: z.string(),
    changes: z.array(
      z
        .object({
          code: z.string(),
          name: z.string(),
          oldPriceCents: z.number().int(),
          newPriceCents: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict()

export type PricingPlan = z.output<typeof pricingPlanSchema>

export const pricingPublishResultSchema = z
  .object({
    oldPricingSetId: z.string(),
    newPricingSetId: z.string(),
    auditEventId: z.string(),
    changeItemCount: z.number().int().nonnegative(),
  })
  .strict()

export type PricingPublishResult = z.output<typeof pricingPublishResultSchema>

export type AdminCliPricingApi = Readonly<{
  loadCatalog: (
    accessToken: string,
    serviceSlug: PricingCatalog["serviceSlug"],
  ) => CliOutcome<PricingCatalog>
  planChange: (
    accessToken: string,
    input: PricingChangeInput,
  ) => CliOutcome<PricingPlan>
  publishChange: (
    accessToken: string,
    input: PricingChangeInput,
  ) => CliOutcome<PricingPublishResult>
}>

type MappedCliInput<Value> =
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "valid"; value: Value }>

export const mappedCliInput = Object.freeze({
  valid: <Value>(value: Value): MappedCliInput<Value> =>
    Object.freeze({ kind: "valid", value }),
  invalid: (message: string): MappedCliInput<never> =>
    Object.freeze({ kind: "invalid", message }),
})

const issues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[]
    message: string
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }))

const serializedIssues = (
  value: unknown,
  path: readonly (string | number)[] = [],
  ancestors: ReadonlySet<object> = new Set(),
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
      serializedIssues(entry, [...path, index], nextAncestors),
    )
  const prototype = Object.getPrototypeOf(value) as unknown
  if (prototype !== Object.prototype && prototype !== null)
    return [{ path, message: "Expected a plain serialized object." }]
  return Object.entries(value).flatMap(([key, entry]) =>
    serializedIssues(entry, [...path, key], nextAncestors),
  )
}

const outputBoundary = <Value>(
  schema: z.ZodType<Value>,
  label: string,
): BoundaryContract<Value> =>
  defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const representationIssues = serializedIssues(serialized)
      if (representationIssues.length > 0)
        return decode.invalid(representationIssues)
      const parsed = schema.safeParse(serialized)
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(issues(parsed.error.issues))
    },
    encode: (value) => {
      const parsed = schema.safeParse(value)
      if (parsed.success && serializedIssues(parsed.data).length === 0)
        return parsed.data
      throw invariantViolationError({
        code: "admin_cli_contract_encode_invalid",
        message: `${label} did not encode as strict serialized data.`,
        safeMessage: "CLI data is inconsistent.",
        cause: parsed.success ? undefined : parsed.error,
      })
    },
  })

const cliFailureBoundary = (): BoundaryContract<CliFailure> =>
  defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const representationIssues = serializedIssues(serialized)
      if (representationIssues.length > 0)
        return decode.invalid(representationIssues)
      const parsed = cliFailureSchema.safeParse(serialized)
      return parsed.success
        ? decode.valid({ kind: "diagnostic", ...parsed.data })
        : decode.invalid(issues(parsed.error.issues))
    },
    encode: ({ kind: _kind, ...failure }) => {
      const parsed = cliFailureSchema.safeParse(failure)
      if (parsed.success && serializedIssues(parsed.data).length === 0)
        return parsed.data
      throw invariantViolationError({
        code: "admin_cli_contract_encode_invalid",
        message: "A CLI failure did not encode as strict serialized data.",
        safeMessage: "CLI data is inconsistent.",
        cause: parsed.success ? undefined : parsed.error,
      })
    },
  })

const inputBoundary = <Value>(
  schema: z.ZodType<Value>,
): BoundaryContract<Value> =>
  defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const mapped = serialized as MappedCliInput<unknown>
      if (
        typeof mapped === "object" &&
        mapped !== null &&
        mapped.kind === "invalid" &&
        typeof mapped.message === "string"
      )
        return decode.invalid([{ path: [], message: mapped.message }])
      if (
        typeof mapped !== "object" ||
        mapped === null ||
        mapped.kind !== "valid"
      )
        return decode.invalid([{ path: [], message: "Invalid CLI input." }])
      const parsed = schema.safeParse(mapped.value)
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(issues(parsed.error.issues))
    },
    encode: (value) => mappedCliInput.valid(value),
  })

export const defineAdminCliContract = <Input, Output>(input: {
  label: string
  input: z.ZodType<Input>
  output: z.ZodType<Output>
}): CellContract<Input, Output, CliFailure> =>
  defineCellContract({
    input: inputBoundary(input.input),
    output: outputBoundary(input.output, `${input.label} output`),
    failure: cliFailureBoundary(),
  })

export const cliFailure = (code: string, message: string): CliFailure =>
  Object.freeze({ kind: "diagnostic", code, message })

export const readRequiredSession = async (
  store: AdminCliSessionStore,
): CliOutcome<CliSession> => {
  const loaded = await store.read()
  if (loaded.kind === "failure") return loaded
  return loaded.value === undefined
    ? {
        kind: "failure",
        failure: cliFailure(
          "missing_cli_session",
          "Run auth login before this command.",
        ),
      }
    : { kind: "success", value: loaded.value }
}

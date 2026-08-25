import { z } from "zod"

const canonicalUtcIsoSchema = z.string().refine((value) => {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}, "Expected a canonical UTC ISO datetime.")
export const utcDateSchema = z.codec(canonicalUtcIsoSchema, z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
})

export const requestMetadataSchema = z
  .object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    requestId: z.string().optional(),
  })
  .strict()
export const principalContextSchema = z
  .object({
    identityId: z.uuid(),
    sessionId: z.uuid(),
    label: z.string().min(1),
  })
  .strict()
export const loginBodySchema = z
  .object({ email: z.email(), password: z.string().min(8) })
  .strict()
export const loginInputSchema = requestMetadataSchema.extend({
  email: z.email(),
  password: z.string().min(8),
})
export const cookieSessionInputSchema = z
  .object({ sessionToken: z.string().min(1), requestId: z.string().optional() })
  .strict()
export const cookieChallengeBodySchema = z.discriminatedUnion("method", [
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
export const cookieChallengeInputSchema = z.union(
  cookieChallengeBodySchema.options.map((schema) =>
    schema.extend({
      challengeToken: z.string().min(1),
      requestId: z.string().optional(),
    }),
  ),
)

const capabilitySchema = z.enum([
  "control:view",
  "team:read",
  "team:write",
  "customers:read",
  "customers:write",
  "orders:read",
  "orders:write",
  "security:read",
  "security:write",
  "auth:mfa:enroll",
  "processor:view",
])
const applicationSchema = z
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
export const controlAccessSchema = z
  .object({
    business: z
      .object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })
      .strict(),
    locations: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(200),
            name: z.string().trim().min(1).max(200),
            timezone: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .max(100),
    selectedLocationId: z.string().trim().min(1).max(200).nullable(),
    capabilities: z
      .array(capabilitySchema)
      .max(capabilitySchema.options.length)
      .refine(
        (capabilities) => new Set(capabilities).size === capabilities.length,
      ),
    applications: z
      .array(applicationSchema)
      .max(2)
      .refine(
        (applications) =>
          new Set(applications.map((application) => application.id)).size ===
          applications.length,
      ),
  })
  .strict()
export const controlSessionSchema = z
  .object({
    status: z.literal("authenticated"),
    principal: z
      .object({
        identityId: z.uuid(),
        displayName: z.string().trim().min(1).max(200),
        email: z.email().optional(),
      })
      .strict(),
    access: controlAccessSchema,
    expiresAt: utcDateSchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()
export const controlLoginDataSchema = z.discriminatedUnion("status", [
  controlSessionSchema,
  z
    .object({
      status: z.literal("mfa_required"),
      methods: z.tuple([z.literal("totp"), z.literal("recovery")]),
    })
    .strict(),
])
export const setCookieHeadersSchema = z.array(
  z
    .string()
    .min(1)
    .refine((value) => !/[\r\n]/.test(value)),
)
export const browserOutput = <Data extends z.ZodType>(data: Data) =>
  z.object({ data, setCookieHeaders: setCookieHeadersSchema }).strict()
export const controlLoginOutputSchema = browserOutput(controlLoginDataSchema)
export const controlSessionOutputSchema = browserOutput(controlSessionSchema)

const controlAuthFailureFields = {
  code: z.string(),
  message: z.string(),
  safeMessage: z.string(),
  traceId: z.string().optional(),
  setCookieHeaders: setCookieHeadersSchema,
}
export const controlAuthenticationFailureSchema = z
  .object({
    kind: z.literal("authentication"),
    ...controlAuthFailureFields,
  })
  .strict()
export const controlConflictFailureSchema = z
  .object({ kind: z.literal("conflict"), ...controlAuthFailureFields })
  .strict()
export const controlPermissionFailureSchema = z
  .object({ kind: z.literal("permission"), ...controlAuthFailureFields })
  .strict()
export const controlRateLimitFailureSchema = z
  .object({ kind: z.literal("rate_limit"), ...controlAuthFailureFields })
  .strict()
export const authFailureSchema = z.discriminatedUnion("kind", [
  controlAuthenticationFailureSchema,
  controlConflictFailureSchema,
  controlPermissionFailureSchema,
  controlRateLimitFailureSchema,
])
export const controlLoginFailureSchema = z.discriminatedUnion("kind", [
  controlAuthenticationFailureSchema,
  controlPermissionFailureSchema,
  controlRateLimitFailureSchema,
])
export const controlSessionFailureSchema = z.discriminatedUnion("kind", [
  controlAuthenticationFailureSchema,
  controlPermissionFailureSchema,
])
export const loginFailureSchema = z
  .object({
    kind: z.enum(["authentication", "rate_limit"]),
    code: z.enum(["invalid_credentials", "login_rate_limited"]),
    message: z.string(),
  })
  .strict()
export const mfaFailureSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("authentication"),
      code: z.enum([
        "invalid_mfa_challenge",
        "expired_mfa_challenge",
        "invalid_mfa_code",
      ]),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("conflict"),
      code: z.enum(["mfa_already_enabled", "mfa_enrollment_missing"]),
      message: z.string(),
    })
    .strict(),
])
export const beginMfaFailureSchema = z
  .object({
    kind: z.literal("conflict"),
    code: z.literal("mfa_already_enabled"),
    message: z.string(),
  })
  .strict()
export const confirmMfaFailureSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("authentication"),
      code: z.literal("invalid_mfa_code"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("conflict"),
      code: z.literal("mfa_enrollment_missing"),
      message: z.string(),
    })
    .strict(),
])
export const loadSessionFailureSchema = z
  .object({
    kind: z.literal("authentication"),
    code: z.enum(["invalid_session", "session_expired"]),
    message: z.string(),
  })
  .strict()
export const logoutSchema = z.object({ revoked: z.literal(true) }).strict()
export const controlLogoutOutputSchema = browserOutput(logoutSchema)

export const identityInputSchema = z.object({ identityId: z.uuid() }).strict()
export const revokeIdentityInputSchema = z
  .object({
    principalIdentityId: z.uuid(),
    identityId: z.uuid(),
    sessionId: z.uuid().optional(),
    requestId: z.string().optional(),
  })
  .strict()
export const sessionInventorySchema = z
  .object({
    sessions: z.array(
      z
        .object({
          id: z.uuid(),
          issuedAt: utcDateSchema,
          lastUsedAt: utcDateSchema,
          expiresAt: utcDateSchema,
          revokedAt: utcDateSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict()
export const revokedCountSchema = z
  .object({ revokedCount: z.number().int().nonnegative() })
  .strict()
export const beginMfaInputSchema = z
  .object({
    identityId: z.uuid(),
    label: z.string().min(1),
    requestId: z.string().optional(),
  })
  .strict()
export const enrollmentSchema = z
  .object({
    secret: z.string().min(16).max(512),
    enrollmentUri: z.string().max(2_000).startsWith("otpauth://totp/"),
  })
  .strict()
export const confirmBodySchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict()
export const confirmMfaInputSchema = z
  .object({
    identityId: z.uuid(),
    sessionId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    requestId: z.string().optional(),
  })
  .strict()
export const identityMutationInputSchema = z
  .object({ identityId: z.uuid(), requestId: z.string().optional() })
  .strict()
export const removeMfaInputSchema = identityMutationInputSchema.extend({
  sessionId: z.uuid(),
})
export const recoveryCodesSchema = z
  .object({
    recoveryCodes: z.array(z.string().min(8).max(100)).min(1).max(20),
  })
  .strict()
export const mfaMutationSchema = z.object({ updated: z.literal(true) }).strict()
export const noFailureSchema = z.never()

export type ControlAccess = z.output<typeof controlAccessSchema>
export type ControlSession = z.output<typeof controlSessionSchema>
export type ControlLoginData = z.output<typeof controlLoginDataSchema>
export type ControlLoginOutput = z.output<typeof controlLoginOutputSchema>
export type ControlSessionOutput = z.output<typeof controlSessionOutputSchema>
export type ControlLogoutOutput = z.output<typeof controlLogoutOutputSchema>
export type Logout = z.output<typeof logoutSchema>
export type ControlAuthFailure = z.output<typeof authFailureSchema>
export type ControlLoginFailure = z.output<typeof controlLoginFailureSchema>
export type ControlSessionFailure = z.output<typeof controlSessionFailureSchema>
export type BeginMfaFailure = z.output<typeof beginMfaFailureSchema>
export type ConfirmMfaFailure = z.output<typeof confirmMfaFailureSchema>
export type LoginInput = z.output<typeof loginInputSchema>
export type CookieSessionInput = z.output<typeof cookieSessionInputSchema>
export type CookieChallengeInput = z.output<typeof cookieChallengeInputSchema>
export type PrincipalContext = z.output<typeof principalContextSchema>
export type IdentityInput = z.output<typeof identityInputSchema>
export type RevokeIdentityInput = z.output<typeof revokeIdentityInputSchema>
export type SessionInventory = z.output<typeof sessionInventorySchema>
export type RevokedCount = z.output<typeof revokedCountSchema>
export type BeginMfaInput = z.output<typeof beginMfaInputSchema>
export type Enrollment = z.output<typeof enrollmentSchema>
export type ConfirmMfaInput = z.output<typeof confirmMfaInputSchema>
export type IdentityMutationInput = z.output<typeof identityMutationInputSchema>
export type RemoveMfaInput = z.output<typeof removeMfaInputSchema>
export type RecoveryCodes = z.output<typeof recoveryCodesSchema>
export type MfaMutation = z.output<typeof mfaMutationSchema>

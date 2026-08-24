import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { z } from "zod"

export const controlCapabilitySchema = z.enum([
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

export const presslyApplicationSchema = z
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
      }, "Application destinations must be origin-only HTTP(S) URLs."),
  })
  .strict()

const controlCapabilityListSchema = z
  .array(controlCapabilitySchema)
  .max(controlCapabilitySchema.options.length)
  .refine(
    (capabilities) => new Set(capabilities).size === capabilities.length,
    "Control capabilities must be unique.",
  )

const presslyApplicationListSchema = z
  .array(presslyApplicationSchema)
  .max(2)
  .refine(
    (applications) =>
      new Set(applications.map((application) => application.id)).size ===
      applications.length,
    "Application destinations must be unique.",
  )

export const controlAuthenticatedSessionSchema = z
  .object({
    status: z.literal("authenticated"),
    principal: z
      .object({
        identityId: z.uuid(),
        displayName: z.string().trim().min(1).max(200),
        email: z.email().optional(),
      })
      .strict(),
    access: z
      .object({
        business: z
          .object({
            id: z.uuid(),
            name: z.string().trim().min(1).max(200),
          })
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
        capabilities: controlCapabilityListSchema,
        applications: presslyApplicationListSchema,
      })
      .strict(),
    expiresAt: utcIsoStringSchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()

export const controlMfaChallengeSchema = z
  .object({
    status: z.literal("mfa_required"),
    methods: z.tuple([z.literal("totp"), z.literal("recovery")]),
  })
  .strict()

export const controlLoginResultSchema = z.discriminatedUnion("status", [
  controlAuthenticatedSessionSchema,
  controlMfaChallengeSchema,
])

export const logoutResultSchema = z
  .object({ revoked: z.literal(true) })
  .strict()

export const sessionInventoryItemSchema = z
  .object({
    id: z.uuid(),
    issuedAt: utcIsoStringSchema,
    lastUsedAt: utcIsoStringSchema,
    expiresAt: utcIsoStringSchema,
    revokedAt: utcIsoStringSchema.nullable(),
  })
  .strict()

export const sessionInventoryResultSchema = z
  .object({ sessions: z.array(sessionInventoryItemSchema) })
  .strict()

export const revokeIdentitySessionsResultSchema = z
  .object({ revokedCount: z.number().int().nonnegative() })
  .strict()

export const mfaEnrollmentResultSchema = z
  .object({
    secret: z.string().min(16).max(512),
    enrollmentUri: z.string().max(2_000).startsWith("otpauth://totp/"),
  })
  .strict()

export const mfaRecoveryCodesResultSchema = z
  .object({
    recoveryCodes: z.array(z.string().min(8).max(100)).min(1).max(20),
  })
  .strict()

export const mfaMutationResultSchema = z
  .object({ updated: z.literal(true) })
  .strict()

export type ControlAuthenticatedSession = z.infer<
  typeof controlAuthenticatedSessionSchema
>
export type ControlLoginResult = z.infer<typeof controlLoginResultSchema>
export type PresslyApplication = z.infer<typeof presslyApplicationSchema>
export type SessionInventoryResult = z.infer<
  typeof sessionInventoryResultSchema
>
export type RevokeIdentitySessionsResult = z.infer<
  typeof revokeIdentitySessionsResultSchema
>
export type MfaEnrollmentResult = z.infer<typeof mfaEnrollmentResultSchema>
export type MfaRecoveryCodesResult = z.infer<
  typeof mfaRecoveryCodesResultSchema
>
export type MfaMutationResult = z.infer<typeof mfaMutationResultSchema>

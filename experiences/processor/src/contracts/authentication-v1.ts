import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { z } from "zod"

export const processorCapabilitySchema = z.enum([
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

const processorPrincipalSchema = z
  .object({
    identityId: z.uuid(),
    displayName: z.string().trim().min(1).max(200),
    email: z.email().optional(),
  })
  .strict()

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
      }, "Application destinations must be origin-only HTTP(S) URLs."),
  })
  .strict()

const processorCapabilityListSchema = z
  .array(processorCapabilitySchema)
  .max(processorCapabilitySchema.options.length)
  .refine(
    (capabilities) => new Set(capabilities).size === capabilities.length,
    "Processor capabilities must be unique."
  )

export const processorAuthenticatedSessionSchema = z
  .object({
    status: z.literal("authenticated"),
    principal: processorPrincipalSchema,
    access: z
      .object({
        locations: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(200),
                name: z.string().trim().min(1).max(200),
                timezone: z.string().trim().min(1).max(100),
                capabilities: processorCapabilityListSchema,
              })
              .strict()
          )
          .max(100),
        applications: z.array(processorApplicationSchema).max(2),
      })
      .strict(),
    expiresAt: utcIsoStringSchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict()

export const processorMfaChallengeSchema = z
  .object({
    status: z.literal("mfa_required"),
    expiresAt: utcIsoStringSchema,
  })
  .strict()

export const processorLoginResultSchema = z.discriminatedUnion("status", [
  processorAuthenticatedSessionSchema,
  processorMfaChallengeSchema,
])

export const logoutResultSchema = z
  .object({ revoked: z.literal(true) })
  .strict()

export type ProcessorCapability = z.infer<typeof processorCapabilitySchema>
export type ProcessorAuthenticatedSession = z.infer<
  typeof processorAuthenticatedSessionSchema
>
export type ProcessorMfaChallenge = z.infer<typeof processorMfaChallengeSchema>
export type ProcessorLoginResult = z.infer<typeof processorLoginResultSchema>
export type ProcessorLogoutResult = z.infer<typeof logoutResultSchema>

import {
  loadSessionFailureSchema,
  loginFailureSchema,
  requestMetadataSchema,
} from "./schemas.ts"
import { z } from "zod"

export const cliAuthApiLoginInputSchema = requestMetadataSchema.extend({
  email: z.email(),
  password: z.string().min(8),
})

export const cliAuthApiChallengeBodySchema = z.discriminatedUnion("method", [
  z
    .object({
      challengeToken: z.string().min(1),
      method: z.literal("totp"),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      challengeToken: z.string().min(1),
      method: z.literal("recovery"),
      code: z.string().min(16).max(40),
    })
    .strict(),
])

export const cliAuthApiChallengeInputSchema = z.union(
  cliAuthApiChallengeBodySchema.options.map((schema) =>
    schema.extend({ requestId: z.string().optional() }),
  ),
)

export const cliAuthApiTokenInputSchema = z
  .object({ bearerToken: z.string().min(1), requestId: z.string().optional() })
  .strict()

export const cliAuthApiControlAccessFailureSchema = z
  .object({
    kind: z.literal("permission"),
    code: z.literal("control_access_unavailable"),
    message: z.string(),
  })
  .strict()

export const cliAuthApiLoginFailureSchema = z.union([
  loginFailureSchema,
  cliAuthApiControlAccessFailureSchema,
])

export const cliAuthApiChallengeFailureSchema = z.union([
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
  cliAuthApiControlAccessFailureSchema,
])

export const cliAuthApiSessionFailureSchema = z.union([
  loadSessionFailureSchema,
  cliAuthApiControlAccessFailureSchema,
])

export type CliAuthApiLoginInput = z.output<typeof cliAuthApiLoginInputSchema>
export type CliAuthApiChallengeInput = z.output<
  typeof cliAuthApiChallengeInputSchema
>
export type CliAuthApiTokenInput = z.output<typeof cliAuthApiTokenInputSchema>
export type CliAuthApiLoginFailure = z.output<
  typeof cliAuthApiLoginFailureSchema
>
export type CliAuthApiChallengeFailure = z.output<
  typeof cliAuthApiChallengeFailureSchema
>
export type CliAuthApiSessionFailure = z.output<
  typeof cliAuthApiSessionFailureSchema
>

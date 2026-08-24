import { z } from "zod"
import { controlManagementContextSchema } from "../model/context.ts"
import { utcDateSchema } from "../model/boundary.ts"
import {
  controlSessionSchema,
  requestMetadataSchema,
  setCookieHeadersSchema,
} from "../../auth/model/schemas.ts"
import { workforceRoleSchema } from "../workforce/contracts.ts"

const acceptanceTokenSchema = z.string().trim().min(32).max(512)
const idempotencyKeySchema = z.string().trim().min(8).max(200)

export const invitationPreviewBodySchema = z
  .object({ acceptanceToken: acceptanceTokenSchema })
  .strict()
export const invitationAcceptBodySchema = z.discriminatedUnion("identityMode", [
  z
    .object({
      identityMode: z.literal("existing_identity"),
      idempotencyKey: idempotencyKeySchema,
      acceptanceToken: acceptanceTokenSchema,
    })
    .strict(),
  z
    .object({
      identityMode: z.literal("new_identity"),
      idempotencyKey: idempotencyKeySchema,
      acceptanceToken: acceptanceTokenSchema,
      password: z.string().min(1).max(256),
    })
    .strict(),
])
export const existingPasswordBodySchema = z
  .object({
    acceptanceToken: acceptanceTokenSchema,
    idempotencyKey: idempotencyKeySchema,
    password: z.string().min(1).max(256),
  })
  .strict()
const mfaFields = {
  acceptanceToken: acceptanceTokenSchema,
  idempotencyKey: idempotencyKeySchema,
}
export const existingMfaBodySchema = z.discriminatedUnion("method", [
  z
    .object({
      ...mfaFields,
      method: z.literal("totp"),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      ...mfaFields,
      method: z.literal("recovery"),
      code: z.string().min(16).max(40),
    })
    .strict(),
])

export const invitationPreviewSchema = z
  .object({
    invitationId: z.uuid(),
    business: z
      .object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })
      .strict(),
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
    expiresAt: utcDateSchema,
    existingIdentity: z.boolean(),
  })
  .strict()
export const invitationAcceptanceSchema = z
  .object({
    invitationId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    identityCreated: z.boolean(),
    privilegedAccessEffective: z.boolean(),
    replayed: z.boolean(),
  })
  .strict()
const applicationSchema = z
  .object({
    id: z.enum(["processor", "control"]),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(160),
    href: z.url().max(300),
  })
  .strict()
export const invitationBootstrapDataSchema = z.union([
  z
    .object({
      status: z.literal("mfa_required"),
      methods: z.tuple([z.literal("totp"), z.literal("recovery")]),
    })
    .strict(),
  z
    .object({
      status: z.literal("accepted"),
      acceptance: invitationAcceptanceSchema,
      session: controlSessionSchema.nullable(),
      destination: applicationSchema,
    })
    .strict(),
])
export const invitationBootstrapOutputSchema = z
  .object({
    data: invitationBootstrapDataSchema,
    setCookieHeaders: setCookieHeadersSchema,
  })
  .strict()

const invitationFailureFields = {
  code: z.string(),
  message: z.string(),
  safeMessage: z.string(),
  status: z.literal(422).optional(),
  traceId: z.string().optional(),
  details: z
    .object({
      currentVersion: z.number().optional(),
      violations: z.array(z.string()).optional(),
      field: z.string().optional(),
    })
    .strict()
    .optional(),
  setCookieHeaders: setCookieHeadersSchema,
}
export const invitationValidationFailureSchema = z
  .object({ kind: z.literal("validation"), ...invitationFailureFields })
  .strict()
export const invitationAuthenticationFailureSchema = z
  .object({ kind: z.literal("authentication"), ...invitationFailureFields })
  .strict()
export const invitationPermissionFailureSchema = z
  .object({ kind: z.literal("permission"), ...invitationFailureFields })
  .strict()
export const invitationNotFoundFailureSchema = z
  .object({ kind: z.literal("not_found"), ...invitationFailureFields })
  .strict()
export const invitationConflictFailureSchema = z
  .object({ kind: z.literal("conflict"), ...invitationFailureFields })
  .strict()
export const invitationRateLimitFailureSchema = z
  .object({ kind: z.literal("rate_limit"), ...invitationFailureFields })
  .strict()
export const invitationFailureSchema = z.discriminatedUnion("kind", [
  invitationValidationFailureSchema,
  invitationAuthenticationFailureSchema,
  invitationPermissionFailureSchema,
  invitationNotFoundFailureSchema,
  invitationConflictFailureSchema,
  invitationRateLimitFailureSchema,
])
export const invitationAcceptanceFailureSchema = z.discriminatedUnion("kind", [
  invitationValidationFailureSchema,
  invitationAuthenticationFailureSchema,
  invitationPermissionFailureSchema,
  invitationNotFoundFailureSchema,
  invitationConflictFailureSchema,
])
export const invitationPreviewFailureSchema = z.discriminatedUnion("kind", [
  invitationValidationFailureSchema,
  invitationNotFoundFailureSchema,
  invitationConflictFailureSchema,
])

export const acceptExistingInvitationInputSchema = z.discriminatedUnion(
  "identityMode",
  [
    invitationAcceptBodySchema.options[0].extend({
      context: controlManagementContextSchema,
    }),
    invitationAcceptBodySchema.options[1].extend({
      context: controlManagementContextSchema,
    }),
  ],
)
export const acceptExistingPasswordInputSchema = existingPasswordBodySchema
  .extend(requestMetadataSchema.shape)
  .strict()
export const acceptExistingMfaInputSchema = z.discriminatedUnion("method", [
  existingMfaBodySchema.options[0].extend({
    challengeToken: z.string().min(1),
    requestId: z.string().optional(),
  }),
  existingMfaBodySchema.options[1].extend({
    challengeToken: z.string().min(1),
    requestId: z.string().optional(),
  }),
])

export type InvitationFailure = z.output<typeof invitationFailureSchema>
export type InvitationAcceptanceFailure = z.output<
  typeof invitationAcceptanceFailureSchema
>
export type InvitationPreviewFailure = z.output<
  typeof invitationPreviewFailureSchema
>
export type InvitationValidationFailure = z.output<
  typeof invitationValidationFailureSchema
>
export type InvitationPreview = z.output<typeof invitationPreviewSchema>
export type InvitationAcceptance = z.output<typeof invitationAcceptanceSchema>
export type InvitationBootstrapData = z.output<
  typeof invitationBootstrapDataSchema
>
export type InvitationBootstrapOutput = z.output<
  typeof invitationBootstrapOutputSchema
>
export type PreviewInvitationInput = z.output<
  typeof invitationPreviewBodySchema
>
export type AcceptNewInvitationInput = z.output<
  typeof invitationAcceptBodySchema
>
export type AcceptExistingInvitationInput = z.output<
  typeof acceptExistingInvitationInputSchema
>
export type AcceptExistingPasswordInput = z.output<
  typeof acceptExistingPasswordInputSchema
>
export type AcceptExistingMfaInput = z.output<
  typeof acceptExistingMfaInputSchema
>

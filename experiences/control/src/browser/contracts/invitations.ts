import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { z } from "zod"
import {
  controlAuthenticatedSessionSchema,
  controlMfaChallengeSchema,
  presslyApplicationSchema,
} from "./authentication.ts"
import { workforceRoleSchema } from "./workforce.ts"

export const controlInvitationPreviewSchema = z
  .object({
    invitationId: z.uuid(),
    business: z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(200),
      })
      .strict(),
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
    expiresAt: utcIsoStringSchema,
    existingIdentity: z.boolean(),
  })
  .strict()

export const controlInvitationAcceptanceSchema = z
  .object({
    invitationId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    identityCreated: z.boolean(),
    privilegedAccessEffective: z.boolean(),
    replayed: z.boolean(),
  })
  .strict()

export const controlInvitationBootstrapResultSchema = z.union([
  controlMfaChallengeSchema,
  z
    .object({
      status: z.literal("accepted"),
      acceptance: controlInvitationAcceptanceSchema,
      session: controlAuthenticatedSessionSchema.nullable(),
      destination: presslyApplicationSchema,
    })
    .strict(),
])

export type ControlInvitationPreview = z.infer<
  typeof controlInvitationPreviewSchema
>
export type ControlInvitationAcceptance = z.infer<
  typeof controlInvitationAcceptanceSchema
>
export type ControlInvitationBootstrapResult = z.infer<
  typeof controlInvitationBootstrapResultSchema
>

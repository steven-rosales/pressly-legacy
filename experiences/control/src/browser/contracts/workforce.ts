import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { z } from "zod"

export const workforceRoleSchema = z.enum(["owner", "manager", "operator"])
const workforceMembershipStateSchema = z.enum(["active", "suspended", "ended"])
const workforceInvitationStateSchema = z.enum([
  "pending",
  "accepted",
  "revoked",
  "expired",
])
const accessGrantStateSchema = z.enum(["active", "revoked", "expired"])

export const controlAccessGrantProjectionSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    role: workforceRoleSchema,
    scope: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("business"), id: z.uuid() }).strict(),
      z
        .object({
          kind: z.literal("location"),
          id: z.string().trim().min(1).max(200),
        })
        .strict(),
    ]),
    state: accessGrantStateSchema,
    version: z.number().int().positive(),
    startsAt: utcIsoStringSchema.nullable(),
    endsAt: utcIsoStringSchema.nullable(),
    effective: z.boolean(),
  })
  .strict()

export const controlWorkforceMemberProjectionSchema = z
  .object({
    membershipId: z.uuid(),
    businessId: z.uuid(),
    identityId: z.uuid(),
    displayName: z.string().trim().min(1).max(200),
    email: z.email().max(320),
    state: workforceMembershipStateSchema,
    version: z.number().int().positive(),
    mfaEnabled: z.boolean(),
    grants: z.array(controlAccessGrantProjectionSchema).max(100),
    startedAt: utcIsoStringSchema,
    suspendedAt: utcIsoStringSchema.nullable(),
    endedAt: utcIsoStringSchema.nullable(),
  })
  .strict()

export const controlWorkforceMemberDetailProjectionSchema =
  controlWorkforceMemberProjectionSchema
    .extend({
      activeSessionCount: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
      createdAt: utcIsoStringSchema,
      updatedAt: utcIsoStringSchema,
    })
    .strict()

export const controlWorkforceInvitationProjectionSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
    state: workforceInvitationStateSchema,
    version: z.number().int().positive(),
    expiresAt: utcIsoStringSchema,
    createdAt: utcIsoStringSchema,
  })
  .strict()

export const controlWorkforceMemberPageSchema = z
  .object({
    members: z.array(controlWorkforceMemberProjectionSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict()

export const controlWorkforceInvitationPageSchema = z
  .object({
    invitations: z.array(controlWorkforceInvitationProjectionSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict()

export const controlIssueInvitationResultSchema = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        status: z.literal("issued"),
        invitation: controlWorkforceInvitationProjectionSchema,
        acceptanceToken: z.string().min(32).max(512),
      })
      .strict(),
    z
      .object({
        status: z.literal("replayed"),
        invitation: controlWorkforceInvitationProjectionSchema,
      })
      .strict(),
  ],
)

export const controlMembershipMutationResultSchema = z
  .object({
    member: controlWorkforceMemberDetailProjectionSchema,
    revokedSessionCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict()

export const controlRevokeAccessResultSchema = z
  .object({
    grant: controlAccessGrantProjectionSchema,
    revokedSessionCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict()

export const controlWorkforceSessionSchema = z
  .object({
    id: z.uuid(),
    issuedAt: utcIsoStringSchema,
    lastUsedAt: utcIsoStringSchema,
    expiresAt: utcIsoStringSchema,
    revokedAt: utcIsoStringSchema.nullable(),
    current: z.boolean(),
  })
  .strict()

export const controlWorkforceSessionListSchema = z
  .object({ sessions: z.array(controlWorkforceSessionSchema).max(200) })
  .strict()

export const controlWorkforceSessionRevokeResultSchema = z
  .object({
    revokedCount: z.number().int().nonnegative(),
    replayed: z.boolean(),
  })
  .strict()

export type WorkforceRole = z.infer<typeof workforceRoleSchema>
export type ControlAccessGrantProjection = z.infer<
  typeof controlAccessGrantProjectionSchema
>
export type ControlWorkforceMemberProjection = z.infer<
  typeof controlWorkforceMemberProjectionSchema
>
export type ControlWorkforceMemberDetailProjection = z.infer<
  typeof controlWorkforceMemberDetailProjectionSchema
>
export type ControlWorkforceInvitationProjection = z.infer<
  typeof controlWorkforceInvitationProjectionSchema
>
export type ControlIssueInvitationResult = z.infer<
  typeof controlIssueInvitationResultSchema
>
export type ControlWorkforceSession = z.infer<
  typeof controlWorkforceSessionSchema
>
